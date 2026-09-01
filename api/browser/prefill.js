import {
  buildWorkerPrefillRequest,
  getBrowserWorkerConfig,
  normalizePrefillResult,
  validatePrefillTask,
} from '../_lib/browserGateway.js'
import { isTrustedSameOriginRequest } from '../_lib/deviceIdentity.js'

const MAX_BODY_BYTES = 128 * 1024

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
  return `bw-prefill-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function sameOrigin(left, right) {
  try {
    return new URL(left).origin === new URL(right).origin
  } catch {
    return false
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  if (!isTrustedSameOriginRequest(req)) {
    return res.status(403).json({ error: 'browser_prefill_origin_rejected' })
  }

  const env = globalThis.process?.env || {}
  const config = getBrowserWorkerConfig(env)
  if (!config.configured) {
    return res.status(503).json({ error: 'browser_worker_not_configured' })
  }

  const body = parseBody(req)
  if (body == null) return res.status(413).json({ error: 'browser_prefill_request_too_large' })

  const validation = validatePrefillTask(body.task, body.approvedFields)
  if (validation.decision !== 'allow') {
    return res.status(400).json({ error: validation.reason || 'invalid_browser_prefill_task' })
  }

  const id = requestId()
  const payload = buildWorkerPrefillRequest(body.task, validation.fields, id)

  try {
    const upstream = await fetch(`${config.baseUrl}/v1/prefill`, {
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
      console.error('Browser worker prefill failed', { requestId: id, status: upstream.status })
      const error = upstream.status === 429
        ? 'browser_worker_rate_limited'
        : upstream.status === 409
          ? 'browser_prefill_revalidation_failed'
          : 'browser_worker_failed'
      return res.status(upstream.status === 429 ? 429 : upstream.status === 409 ? 409 : 502).json({ error, requestId: id })
    }

    const contentType = upstream.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      console.error('Browser worker prefill returned non-JSON', { requestId: id })
      return res.status(502).json({ error: 'browser_worker_invalid_response', requestId: id })
    }

    const raw = await upstream.json()
    const prefill = normalizePrefillResult(raw)

    if (prefill.url && !sameOrigin(body.task.jobUrl, prefill.url)) {
      console.error('Browser worker prefill origin scope violation', { requestId: id })
      return res.status(502).json({ error: 'browser_worker_navigation_scope_violation', requestId: id })
    }

    if (prefill.metadata.submitAttempted || !prefill.metadata.networkFrozen) {
      console.error('Browser worker prefill policy violation', { requestId: id })
      return res.status(502).json({ error: 'browser_worker_prefill_policy_violation', requestId: id })
    }

    return res.status(200).json({ requestId: id, prefill })
  } catch (error) {
    console.error('Browser worker prefill gateway error', {
      requestId: id,
      name: error?.name || 'Error',
    })
    return res.status(502).json({ error: 'browser_worker_unavailable', requestId: id })
  }
}
