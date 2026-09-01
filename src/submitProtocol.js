import { resolveConnector } from './connectors.js'
import { SUBMIT_APPROVAL_TTL_MS, SUBMIT_READINESS_VERSION, SUBMIT_SCOPE } from './submitReadiness.js'

const SESSION_ID_RE = /^[A-Za-z0-9_-]{32,120}$/
const APPROVAL_ID_RE = /^[A-Za-z0-9._:-]{4,180}$/
const SUBMIT_CONNECTORS = new Set(['greenhouse', 'lever', 'ashby'])

function clean(value, max = 2_000) {
  return String(value || '').trim().slice(0, max)
}

function time(value) {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isFinite(date.getTime()) ? date.getTime() : NaN
}

export function validateSubmitApprovalRecord(approval, { now = new Date() } = {}) {
  if (!approval || typeof approval !== 'object') return { ok: false, reason: 'submit_approval_required' }
  if (approval.version !== SUBMIT_READINESS_VERSION) return { ok: false, reason: 'submit_approval_version_invalid' }
  if (approval.scope !== SUBMIT_SCOPE) return { ok: false, reason: 'submit_approval_scope_invalid' }
  if (approval.decision !== 'explicit_user_approval') return { ok: false, reason: 'submit_approval_decision_invalid' }
  if (approval.consumed !== false) return { ok: false, reason: 'submit_approval_already_consumed' }

  const id = clean(approval.id, 180)
  const sessionId = clean(approval.sessionId, 160)
  const connectorId = clean(approval.connectorId, 60)
  const jobUrl = clean(approval.jobUrl, 2_000)
  const jobId = approval.jobId ? clean(approval.jobId, 180) : null

  if (!APPROVAL_ID_RE.test(id)) return { ok: false, reason: 'submit_approval_id_invalid' }
  if (!SESSION_ID_RE.test(sessionId)) return { ok: false, reason: 'submit_approval_session_invalid' }
  if (!SUBMIT_CONNECTORS.has(connectorId)) return { ok: false, reason: 'submit_approval_connector_not_enabled' }

  let parsed
  try {
    parsed = new URL(jobUrl)
  } catch {
    return { ok: false, reason: 'submit_approval_job_url_invalid' }
  }
  if (parsed.protocol !== 'https:') return { ok: false, reason: 'submit_approval_https_required' }
  if (parsed.username || parsed.password) return { ok: false, reason: 'submit_approval_url_credentials_not_allowed' }
  if (resolveConnector({ url: parsed.toString() }).id !== connectorId) {
    return { ok: false, reason: 'submit_approval_connector_url_mismatch' }
  }

  const nowMs = time(now)
  const approvedAtMs = time(approval.approvedAt)
  const expiresAtMs = time(approval.expiresAt)
  if (!Number.isFinite(nowMs) || !Number.isFinite(approvedAtMs) || !Number.isFinite(expiresAtMs)) {
    return { ok: false, reason: 'submit_approval_timestamp_invalid' }
  }
  if (approvedAtMs > nowMs + 60_000) return { ok: false, reason: 'submit_approval_from_future' }
  if (expiresAtMs <= nowMs) return { ok: false, reason: 'submit_approval_expired' }
  if (expiresAtMs <= approvedAtMs || expiresAtMs - approvedAtMs > SUBMIT_APPROVAL_TTL_MS + 5_000) {
    return { ok: false, reason: 'submit_approval_ttl_invalid' }
  }

  parsed.hash = ''
  return {
    ok: true,
    reason: 'submit_approval_valid',
    approval: {
      version: SUBMIT_READINESS_VERSION,
      id,
      scope: SUBMIT_SCOPE,
      decision: 'explicit_user_approval',
      connectorId,
      jobId,
      jobUrl: parsed.toString(),
      sessionId,
      approvedAt: new Date(approvedAtMs).toISOString(),
      expiresAt: new Date(expiresAtMs).toISOString(),
      consumed: false,
    },
  }
}
