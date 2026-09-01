import {
  buildWorkerSubmitRequest,
  getBrowserWorkerConfig,
  normalizeSubmitOutcome,
  validateSubmitApproval,
} from '../_lib/browserGateway.js'
import { isTrustedSameOriginRequest } from '../_lib/deviceIdentity.js'

const MAX_BODY_BYTES = 64 * 1024

function parseBody(req) {
  if (!req.body) return {}
  if (typeof req.body === 'string') {
    if (new TextEncoder().encode(req.body).byteLength > MAX_BODY_BYTES) return null
    try { return JSON.parse(req.body) } catch { return {} }
  }
  return req.body
}

function requestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `bw-submit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  if (!isTrustedSameOriginRequest(req)) {
    return res.status(403).json({ error: 'browser_submit_origin_rejected' })
  }

  const env = globalThis.process?.env || {}
  const config = getBrowserWorkerConfig(env)
  if (!config.configured) {
    return res.status(503).json({ error: 'browser_worker_not_configured' })
  }

  const body = parseBody(req)
  if (body == null) return res.status(413).json({ error: 'browser_submit_request_too_large' })

  const validation = validateSubmitApproval(body.approval)
  if (!validation.ok) {
    return res.status(400).json({ error: validation.reason || 'invalid_submit_approval' })
  }
  const approval = validation.approval
  const id = requestId()
  const payload = buildWorkerSubmitRequest(approval, id)

  try {
    const upstream = await fetch(`${config.baseUrl}/v1/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${config.token}`,
        'x-offerclaw-request-id': id,
      },
      body: JSON.stringify(payload),
      redirect: 'error',
      signal: AbortSignal.timeout(config.timeoutMs),
    })

    if (!upstream.ok) {
      console.error('Browser worker submit rejected', { requestId: id, status: upstream.status })
      const error = upstream.status === 429
        ? 'browser_worker_rate_limited'
        : upstream.status === 409
          ? 'browser_submit_session_rejected'
          : upstream.status === 400
            ? 'browser_submit_invalid'
            : 'browser_worker_failed'
      const status = upstream.status === 429 ? 429 : upstream.status === 409 ? 409 : upstream.status === 400 ? 400 : 502
      return res.status(status).json({ error, requestId: id })
    }

    const contentType = upstream.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      console.error('Browser worker submit returned non-JSON', { requestId: id })
      return res.status(502).json({ error: 'browser_worker_invalid_response', requestId: id })
    }

    const outcome = normalizeSubmitOutcome(await upstream.json())
    if (
      outcome.connectorId !== approval.connectorId
      || outcome.approvalId !== approval.id
      || outcome.sessionId !== approval.sessionId
    ) {
      console.error('Browser worker submit binding violation', { requestId: id })
      return res.status(502).json({ error: 'browser_worker_submit_binding_violation', requestId: id })
    }

    if (outcome.attempted && !outcome.sessionClosed) {
      console.error('Browser worker retained attempted submit session', { requestId: id })
      return res.status(502).json({ error: 'browser_worker_submit_session_violation', requestId: id })
    }

    return res.status(200).json({ requestId: id, outcome })
  } catch (error) {
    console.error('Browser worker submit gateway error', {
      requestId: id,
      name: error?.name || 'Error',
    })
    return res.status(502).json({ error: 'browser_worker_unavailable', requestId: id })
  }
}
