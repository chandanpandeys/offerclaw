import { createSubmitApprovalRecord, evaluateSubmitReadiness } from './submitReadiness.js'

async function readBody(response) {
  try { return await response.json() } catch { return {} }
}

function apiError(body, fallback) {
  const code = String(body?.error || fallback)
  const error = new Error(code)
  error.code = code
  error.requestId = body?.requestId || null
  return error
}

export function submitReadinessForReview(job, review, prefill, now = new Date()) {
  return evaluateSubmitReadiness({ job, review, prefill, now })
}

export function createSubmitApprovalForReview(job, review, prefill, now = new Date()) {
  const readiness = submitReadinessForReview(job, review, prefill, now)
  if (!readiness.ready) {
    const error = new Error('submit_not_ready')
    error.code = 'submit_not_ready'
    error.readiness = readiness
    throw error
  }
  return {
    readiness,
    approval: createSubmitApprovalRecord(readiness, { now }),
  }
}

export async function requestSupervisedSubmit(approval, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') throw new Error('submit_fetch_unavailable')
  const response = await fetchImpl('/api/browser/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approval }),
  })
  const body = await readBody(response)
  if (!response.ok) throw apiError(body, 'browser_submit_failed')
  if (!body.outcome || typeof body.outcome !== 'object') throw apiError({}, 'browser_submit_invalid_response')
  return { requestId: body.requestId || null, outcome: body.outcome }
}

export function submitErrorMessage(error) {
  const code = String(error?.code || error?.message || '')
  const messages = {
    submit_not_ready: 'The frozen review is no longer ready to submit. Re-inspect and review the application again.',
    browser_worker_not_configured: 'Supervised submission is not configured on this deployment yet.',
    browser_worker_rate_limited: 'The browser worker is busy. No automatic retry was attempted.',
    browser_worker_unavailable: 'The browser worker could not be reached. No automatic retry was attempted.',
    browser_submit_session_rejected: 'The retained review session expired, changed, or was already used. Re-inspect before trying again.',
    browser_submit_invalid: 'The final submit approval was rejected before any submission attempt.',
    browser_worker_submit_binding_violation: 'Submission stopped because the worker result did not match the approved job/session.',
    browser_worker_submit_session_violation: 'Submission stopped because the worker did not close an attempted session safely.',
    browser_submit_invalid_response: 'The browser worker returned an invalid submission result.',
  }
  return messages[code] || 'Supervised submission failed. OfferClaw did not automatically retry.'
}

export function readinessBlockerLabel(blocker = {}) {
  const detail = blocker.detail ? `: ${String(blocker.detail).replaceAll('_', ' ')}` : ''
  return `${String(blocker.code || 'submit_blocked').replaceAll('_', ' ')}${detail}`
}
