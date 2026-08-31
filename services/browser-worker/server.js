import { timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { closeBrowser, inspectApplicationPage, WORKER_VERSION } from './inspector.js'
import { validateInspectRequest, WORKER_CONNECTORS } from './security.js'

const env = globalThis.process?.env || {}
const port = Math.min(65_535, Math.max(1_024, Number(env.PORT) || 8787))
const expectedToken = String(env.BROWSER_WORKER_TOKEN || '').trim()
const maxConcurrency = Math.min(4, Math.max(1, Number(env.BROWSER_WORKER_MAX_CONCURRENCY) || 2))
const inspectTimeoutMs = Math.min(20_000, Math.max(5_000, Number(env.BROWSER_WORKER_INSPECT_TIMEOUT_MS) || 15_000))
const maxBodyBytes = 64 * 1024
let activeInspections = 0

function json(res, status, body) {
  const rendered = JSON.stringify(body)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Length', String(new TextEncoder().encode(rendered).byteLength))
  res.end(rendered)
}

function safeEqual(left, right) {
  const encoder = new TextEncoder()
  const a = encoder.encode(String(left || ''))
  const b = encoder.encode(String(right || ''))
  if (a.byteLength !== b.byteLength) return false
  return timingSafeEqual(a, b)
}

function bearerToken(req) {
  const header = String(req.headers.authorization || '')
  return header.startsWith('Bearer ') ? header.slice(7).trim() : ''
}

async function readJson(req) {
  const decoder = new TextDecoder()
  let total = 0
  let text = ''
  for await (const chunk of req) {
    total += chunk.byteLength
    if (total > maxBodyBytes) throw Object.assign(new Error('body_too_large'), { code: 'body_too_large' })
    text += decoder.decode(chunk, { stream: true })
  }
  text += decoder.decode()
  if (!text.trim()) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw Object.assign(new Error('invalid_json'), { code: 'invalid_json' })
  }
}

async function handleInspect(req, res) {
  if (!expectedToken) return json(res, 503, { error: 'worker_not_configured' })
  if (!safeEqual(bearerToken(req), expectedToken)) return json(res, 401, { error: 'unauthorized' })
  if (!String(req.headers['content-type'] || '').toLowerCase().includes('application/json')) {
    return json(res, 415, { error: 'json_required' })
  }
  if (activeInspections >= maxConcurrency) return json(res, 429, { error: 'worker_busy' })

  let payload
  try {
    payload = await readJson(req)
  } catch (error) {
    const code = error?.code === 'body_too_large' ? 413 : 400
    return json(res, code, { error: error?.code || 'invalid_request' })
  }

  const validation = validateInspectRequest(payload)
  if (!validation.ok) return json(res, 400, { error: validation.reason })

  activeInspections += 1
  const started = Date.now()
  try {
    const inspection = await inspectApplicationPage(validation, { timeoutMs: inspectTimeoutMs })
    console.info('browser inspection complete', {
      requestId: validation.requestId,
      connectorId: validation.connectorId,
      fieldCount: inspection.fields.length,
      latencyMs: Date.now() - started,
    })
    return json(res, 200, inspection)
  } catch (error) {
    console.error('browser inspection failed', {
      requestId: validation.requestId,
      connectorId: validation.connectorId,
      code: error?.code || error?.name || 'Error',
      latencyMs: Date.now() - started,
    })
    return json(res, error?.code === 'navigation_scope_violation' ? 409 : 502, {
      error: error?.code === 'navigation_scope_violation' ? 'navigation_scope_violation' : 'inspection_failed',
    })
  } finally {
    activeInspections -= 1
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://worker.local')

  if (req.method === 'GET' && url.pathname === '/health') {
    return json(res, 200, {
      ok: true,
      service: 'offerclaw-browser-worker',
      version: WORKER_VERSION,
      mode: 'inspection_only',
      configured: Boolean(expectedToken),
      connectors: WORKER_CONNECTORS,
      writesAllowed: false,
      activeInspections,
      maxConcurrency,
    })
  }

  if (req.method === 'POST' && url.pathname === '/v1/inspect') {
    return handleInspect(req, res)
  }

  return json(res, 404, { error: 'not_found' })
})

server.listen(port, '0.0.0.0', () => {
  console.info(`OfferClaw browser worker listening on :${port}`)
})

async function shutdown() {
  server.close()
  await closeBrowser()
}

globalThis.process?.once('SIGTERM', shutdown)
globalThis.process?.once('SIGINT', shutdown)
