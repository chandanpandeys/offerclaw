import {
  buildWorkerInspectRequest,
  getBrowserWorkerConfig,
  normalizeInspectionResult,
  validateInspectionTask,
} from '../_lib/browserGateway.js'

function parseBody(req) {
  if (!req.body) return {}
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body) } catch { return {} }
  }
  return req.body
}

function requestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `bw-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function sameOrigin(left, right) {
  try {
    return new URL(left).origin === new URL(right).origin
  } catch {
    return false
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const env = globalThis.process?.env || {}
  const config = getBrowserWorkerConfig(env)
  if (!config.configured) {
    return res.status(503).json({ error: 'browser_worker_not_configured' })
  }

  const body = parseBody(req)
  const task = body.task
  const validation = validateInspectionTask(task)
  if (validation.decision !== 'allow') {
    return res.status(400).json({ error: validation.reason || 'invalid_browser_task' })
  }

  const id = requestId()
  const payload = buildWorkerInspectRequest(task, id)

  try {
    const upstream = await fetch(`${config.baseUrl}/v1/inspect`, {
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
      console.error('Browser worker inspection failed', { requestId: id, status: upstream.status })
      return res.status(upstream.status === 429 ? 429 : 502).json({
        error: upstream.status === 429 ? 'browser_worker_rate_limited' : 'browser_worker_failed',
        requestId: id,
      })
    }

    const contentType = upstream.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      console.error('Browser worker returned non-JSON', { requestId: id })
      return res.status(502).json({ error: 'browser_worker_invalid_response', requestId: id })
    }

    const raw = await upstream.json()
    const inspection = normalizeInspectionResult(raw)

    if (inspection.url && !sameOrigin(task.jobUrl, inspection.url)) {
      console.error('Browser worker origin scope violation', { requestId: id })
      return res.status(502).json({ error: 'browser_worker_navigation_scope_violation', requestId: id })
    }

    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({
      requestId: id,
      inspection,
    })
  } catch (error) {
    console.error('Browser worker gateway error', {
      requestId: id,
      name: error?.name || 'Error',
    })
    return res.status(502).json({ error: 'browser_worker_unavailable', requestId: id })
  }
}
