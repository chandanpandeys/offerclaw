import { resolveConnector } from './connectors.js'

export const SUBMIT_READINESS_VERSION = 1
export const SUBMIT_APPROVAL_TTL_MS = 5 * 60 * 1000
export const SUBMIT_SCOPE = 'submit_once'

const READY_CONNECTORS = new Set(['greenhouse', 'lever', 'ashby'])
const SESSION_ID_RE = /^[A-Za-z0-9_-]{32,120}$/

function text(value, max = 2_000) {
  return String(value || '').trim().slice(0, max)
}

function timestamp(value) {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isFinite(date.getTime()) ? date.getTime() : NaN
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

function blocker(code, detail = null) {
  return detail ? { code, detail: text(detail, 240) } : { code }
}

function requiredPlanFields(review) {
  return Array.isArray(review?.plan?.fields)
    ? review.plan.fields.filter(field => Boolean(field.required))
    : []
}

function prefillByKey(prefill) {
  const map = new Map()
  for (const field of Array.isArray(prefill?.fields) ? prefill.fields : []) {
    const key = text(field?.key, 180)
    if (key && !map.has(key)) map.set(key, field)
  }
  return map
}

export function evaluateSubmitReadiness({ job = {}, review = {}, prefill = {}, now = new Date() } = {}) {
  const blockers = []
  const jobUrl = text(job.url || job.applyUrl, 2_000)
  const connector = resolveConnector({ url: jobUrl })
  const nowMs = timestamp(now)

  if (!jobUrl) blockers.push(blocker('submit_job_url_missing'))
  if (!READY_CONNECTORS.has(connector.id)) blockers.push(blocker('submit_connector_not_enabled', connector.id))

  if (review.jobId !== (job.id || null)) blockers.push(blocker('submit_review_job_mismatch'))
  if (review.connectorId !== connector.id) blockers.push(blocker('submit_review_connector_mismatch'))
  if (!sameUrl(review.requestUrl, jobUrl)) blockers.push(blocker('submit_review_url_mismatch'))

  const checkpoints = review.checkpoints || {}
  if (checkpoints.captchaDetected) blockers.push(blocker('submit_captcha_checkpoint'))
  if (checkpoints.twoFactorDetected) blockers.push(blocker('submit_two_factor_checkpoint'))
  if (checkpoints.loginRequired) blockers.push(blocker('submit_login_checkpoint'))

  if (prefill.connectorId !== connector.id) blockers.push(blocker('submit_prefill_connector_mismatch'))
  if (!sameUrl(prefill.url, jobUrl)) blockers.push(blocker('submit_prefill_url_mismatch'))

  const sessionId = text(prefill?.session?.id, 160)
  const sessionExpiresAt = timestamp(prefill?.session?.expiresAt)
  if (!SESSION_ID_RE.test(sessionId)) blockers.push(blocker('submit_prefill_session_missing'))
  if (!Number.isFinite(sessionExpiresAt) || !Number.isFinite(nowMs) || sessionExpiresAt <= nowMs) {
    blockers.push(blocker('submit_prefill_session_expired'))
  }

  if (prefill?.metadata?.networkFrozen !== true) blockers.push(blocker('submit_network_not_frozen'))
  if (prefill?.metadata?.browserOffline !== true) blockers.push(blocker('submit_browser_not_offline'))
  if (prefill?.metadata?.submitAttempted === true) blockers.push(blocker('submit_already_attempted'))

  const prefilled = prefillByKey(prefill)
  for (const field of requiredPlanFields(review)) {
    const key = text(field.key, 180)
    if (field.decision !== 'prefill') {
      blockers.push(blocker('submit_required_field_needs_review', key || field.label))
      continue
    }
    const result = prefilled.get(key)
    if (!result || result.status !== 'filled') {
      blockers.push(blocker('submit_required_prefill_not_filled', key || field.label))
    }
  }

  for (const field of prefilled.values()) {
    if (field.status === 'rejected') blockers.push(blocker('submit_prefill_rejected', field.key))
  }

  const unique = []
  const seen = new Set()
  for (const item of blockers) {
    const key = `${item.code}:${item.detail || ''}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(item)
  }

  return {
    version: SUBMIT_READINESS_VERSION,
    ready: unique.length === 0,
    connectorId: connector.id,
    jobId: job.id || null,
    jobUrl: jobUrl || null,
    sessionId: SESSION_ID_RE.test(sessionId) ? sessionId : null,
    sessionExpiresAt: Number.isFinite(sessionExpiresAt) ? new Date(sessionExpiresAt).toISOString() : null,
    checkedAt: Number.isFinite(nowMs) ? new Date(nowMs).toISOString() : null,
    requiredFieldCount: requiredPlanFields(review).length,
    blockers: unique,
  }
}

export function createSubmitApprovalRecord(readiness, {
  now = new Date(),
  idFactory = () => globalThis.crypto?.randomUUID?.() || `submit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
} = {}) {
  if (!readiness?.ready) throw new Error('submit_readiness_required')
  if (!SESSION_ID_RE.test(String(readiness.sessionId || ''))) throw new Error('submit_session_required')

  const nowMs = timestamp(now)
  const sessionExpires = timestamp(readiness.sessionExpiresAt)
  if (!Number.isFinite(nowMs) || !Number.isFinite(sessionExpires) || sessionExpires <= nowMs) {
    throw new Error('submit_session_expired')
  }

  const expiresAt = Math.min(sessionExpires, nowMs + SUBMIT_APPROVAL_TTL_MS)
  const id = text(idFactory(), 180)
  if (!id) throw new Error('submit_approval_id_required')

  return {
    version: SUBMIT_READINESS_VERSION,
    id,
    scope: SUBMIT_SCOPE,
    decision: 'explicit_user_approval',
    jobId: readiness.jobId || null,
    connectorId: readiness.connectorId,
    jobUrl: readiness.jobUrl,
    sessionId: readiness.sessionId,
    approvedAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    consumed: false,
  }
}
