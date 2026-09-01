import { getBrowserWorkerConfig } from '../_lib/browserGateway.js'
import { isTrustedSameOriginRequest } from '../_lib/deviceIdentity.js'

const SESSION_ID_RE = /^[A-Za-z0-9_-]{32,120}$/
const MAX_BODY_BYTES = 8 * 1024

function parseBody(req) {
  if (!req.body) return {}
  if (typeof req.body === 'string') {
    if (new TextEncoder().encode(req.body).byteLength > MAX_BODY_BYTES) return null
    try { return JSON.parse(req.body) } catch { return {} }
  }
  return req.body
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE')
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  if (!isTrustedSameOriginRequest(req)) {
    return res.status(403).json({ error: 'browser_prefill_origin_rejected' })
  }

  const body = parseBody(req)
  if (body == null) return res.status(413).json({ error: 'browser_prefill_session_request_too_large' })

  const sessionId = String(body.sessionId || '').trim()
  if (!SESSION_ID_RE.test(sessionId)) {
    return res.status(400).json({ error: 'invalid_prefill_session_id' })
  }

  const env = globalThis.process?.env || {}
  const config = getBrowserWorkerConfig(env)
  if (!config.configured) {
    return res.status(503).json({ error: 'browser_worker_not_configured' })
  }

  try {
    const upstream = await fetch(`${config.baseUrl}/v1/session/close`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${config.token}`,
      },
      body: JSON.stringify({ sessionId }),
      redirect: 'error',
      signal: AbortSignal.timeout(Math.min(config.timeoutMs, 10_000)),
    })

    if (upstream.status === 404) {
      return res.status(404).json({ error: 'prefill_session_not_found' })
    }
    if (!upstream.ok) {
      return res.status(upstream.status === 429 ? 429 : 502).json({
        error: upstream.status === 429 ? 'browser_worker_rate_limited' : 'browser_worker_failed',
      })
    }

    return res.status(200).json({ closed: true })
  } catch {
    return res.status(502).json({ error: 'browser_worker_unavailable' })
  }
}
