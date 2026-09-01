import { randomBytes } from 'node:crypto'

const SESSION_ID_RE = /^[A-Za-z0-9_-]{32,120}$/
const APPROVAL_ID_RE = /^[A-Za-z0-9._:-]{4,180}$/
const DEFAULT_TTL_MS = 10 * 60 * 1000
const DEFAULT_MAX_SESSIONS = 8
const MAX_USED_APPROVAL_IDS = 16
const sessions = new Map()

function clean(value, max = 2_000) {
  return String(value || '').trim().slice(0, max)
}

function nowMs(value = Date.now()) {
  const number = value instanceof Date ? value.getTime() : Number(value)
  return Number.isFinite(number) ? number : Date.now()
}

function sessionId() {
  return randomBytes(32).toString('base64url')
}

function sameUrl(left, right) {
  try {
    const a = new URL(left)
    const b = new URL(right)
    a.hash = ''
    b.hash = ''
    return a.toString() === b.toString()
  } catch {
    return false
  }
}

function compactPrefillFields(fields) {
  return (Array.isArray(fields) ? fields : []).slice(0, 40).map(field => ({
    key: clean(field?.key, 180),
    status: ['filled', 'rejected', 'skipped'].includes(field?.status) ? field.status : 'rejected',
    reason: clean(field?.reason, 180) || null,
  }))
}

async function dispose(record) {
  if (!record) return
  if (record.timer) clearTimeout(record.timer)
  record.state = 'closed'
  await record.context?.close?.().catch(() => {})
}

async function pruneExpired(now = Date.now()) {
  const current = nowMs(now)
  const expired = [...sessions.values()].filter(record => record.expiresAtMs <= current)
  for (const record of expired) {
    sessions.delete(record.id)
    await dispose(record)
  }
}

async function evictOldest(maxSessions) {
  if (sessions.size < maxSessions) return
  const oldest = [...sessions.values()].sort((a, b) => a.createdAtMs - b.createdAtMs)[0]
  if (!oldest) return
  sessions.delete(oldest.id)
  await dispose(oldest)
}

export async function retainPrefillSession({
  context,
  page,
  connectorId,
  targetUrl,
  targetOrigin,
  approvedFieldKeys = [],
  requestId = null,
  networkState = null,
  prefillFields = [],
  checkpoints = {},
}, options = {}) {
  if (!context || !page) throw new Error('prefill_session_context_required')

  const ttlMs = Math.min(15 * 60 * 1000, Math.max(60_000, Number(options.ttlMs) || DEFAULT_TTL_MS))
  const maxSessions = Math.min(16, Math.max(1, Number(options.maxSessions) || DEFAULT_MAX_SESSIONS))
  const createdAtMs = nowMs(options.now)
  const expiresAtMs = createdAtMs + ttlMs

  await pruneExpired(createdAtMs)
  await evictOldest(maxSessions)

  const id = sessionId()
  const record = {
    id,
    context,
    page,
    connectorId: clean(connectorId, 60),
    targetUrl: clean(targetUrl, 2_000),
    targetOrigin: clean(targetOrigin, 2_000),
    approvedFieldKeys: [...new Set((Array.isArray(approvedFieldKeys) ? approvedFieldKeys : []).map(value => clean(value, 180)).filter(Boolean))].slice(0, 40),
    prefillFields: compactPrefillFields(prefillFields),
    checkpoints: {
      captchaDetected: Boolean(checkpoints?.captchaDetected),
      twoFactorDetected: Boolean(checkpoints?.twoFactorDetected),
      loginRequired: Boolean(checkpoints?.loginRequired),
    },
    requestId: requestId ? clean(requestId, 120) : null,
    networkState,
    state: 'prefilled',
    activeApprovalId: null,
    usedApprovalIds: new Set(),
    submitAttempted: false,
    createdAtMs,
    expiresAtMs,
    timer: null,
  }

  const timer = setTimeout(() => {
    const current = sessions.get(id)
    if (!current) return
    sessions.delete(id)
    void dispose(current)
  }, ttlMs)
  timer.unref?.()
  record.timer = timer
  sessions.set(id, record)

  return {
    id,
    expiresAt: new Date(expiresAtMs).toISOString(),
    ttlSeconds: Math.floor(ttlMs / 1000),
  }
}

export async function getPrefillSession(id, options = {}) {
  await pruneExpired(options.now)
  const key = clean(id, 160)
  if (!SESSION_ID_RE.test(key)) return null
  const record = sessions.get(key)
  if (!record) return null
  return record
}

export async function claimPrefillSessionForSubmit(id, {
  approvalId,
  connectorId,
  targetUrl,
  now = Date.now(),
} = {}) {
  await pruneExpired(now)
  const key = clean(id, 160)
  const approvalKey = clean(approvalId, 180)
  if (!SESSION_ID_RE.test(key)) return { ok: false, reason: 'submit_session_invalid' }
  if (!APPROVAL_ID_RE.test(approvalKey)) return { ok: false, reason: 'submit_approval_id_invalid' }

  const record = sessions.get(key)
  if (!record) return { ok: false, reason: 'submit_session_not_found' }
  if (record.expiresAtMs <= nowMs(now)) return { ok: false, reason: 'submit_session_expired' }
  if (record.usedApprovalIds.has(approvalKey)) return { ok: false, reason: 'submit_approval_replayed' }
  if (record.state !== 'prefilled') return { ok: false, reason: 'submit_session_busy_or_consumed' }
  if (clean(connectorId, 60) !== record.connectorId) return { ok: false, reason: 'submit_session_connector_mismatch' }
  if (!sameUrl(targetUrl, record.targetUrl)) return { ok: false, reason: 'submit_session_url_mismatch' }
  if (record.submitAttempted) return { ok: false, reason: 'submit_session_already_attempted' }
  if (record.networkState?.mode !== 'frozen' || record.networkState?.browserOffline !== true) {
    return { ok: false, reason: 'submit_session_not_frozen' }
  }

  record.usedApprovalIds.add(approvalKey)
  while (record.usedApprovalIds.size > MAX_USED_APPROVAL_IDS) {
    const oldest = record.usedApprovalIds.values().next().value
    record.usedApprovalIds.delete(oldest)
  }
  record.state = 'submitting'
  record.activeApprovalId = approvalKey

  return { ok: true, record }
}

export function markSubmitNetworkAttempt(record, approvalId) {
  const approvalKey = clean(approvalId, 180)
  if (!record || record.state !== 'submitting' || record.activeApprovalId !== approvalKey) return false
  record.submitAttempted = true
  return true
}

export function releasePrefillSubmitClaim(record, approvalId) {
  const approvalKey = clean(approvalId, 180)
  if (!record || record.state !== 'submitting' || record.activeApprovalId !== approvalKey) return false
  if (record.submitAttempted) return false
  record.state = 'prefilled'
  record.activeApprovalId = null
  return true
}

export async function closePrefillSession(id) {
  const key = clean(id, 160)
  if (!SESSION_ID_RE.test(key)) return false
  const record = sessions.get(key)
  if (!record) return false
  sessions.delete(key)
  await dispose(record)
  return true
}

export async function closeAllPrefillSessions() {
  const records = [...sessions.values()]
  sessions.clear()
  await Promise.all(records.map(record => dispose(record)))
}

export function prefillSessionStats() {
  return { active: sessions.size, maxDefault: DEFAULT_MAX_SESSIONS }
}
