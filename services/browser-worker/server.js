import { timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { closeBrowser, inspectApplicationPage, WORKER_VERSION } from './inspector.js'
import { closePrefillBrowser, prefillApplicationPage, PREFILL_WORKER_VERSION } from './prefiller.js'
import { validateInspectRequest, validatePrefillRequest, validateSubmitRequest, WORKER_CONNECTORS } from './security.js'
import {
  closeAllPrefillSessions,
  closePrefillSession,
  prefillSessionStats,
} from './sessionStore.js'
import { submitPrefilledApplication, SUBMIT_WORKER_VERSION } from './submitter.js'

const env = globalThis.process?.env || {}
const port = Math.min(65_535, Math.max(1_024, Number(env.PORT) || 8787))
const expectedToken = String(env.BROWSER_WORKER_TOKEN || '').trim()
const maxConcurrency = Math.min(4, Math.max(1, Number(env.BROWSER_WORKER_MAX_CONCURRENCY) || 2))
const inspectTimeoutMs = Math.min(20_000, Math.max(5_000, Number(env.BROWSER_WORKER_INSPECT_TIMEOUT_MS) || 15_000))
const maxBodyBytes = 128 * 1024
let activeTasks = 0

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

function authorizeJsonRequest(req, res) {
  if (!expectedToken) {
    json(res, 503, { error: 'worker_not_configured' })
    return false
  }
  if (!safeEqual(bearerToken(req), expectedToken)) {
    json(res, 401, { error: 'unauthorized' })
    return false
  }
  if (!String(req.headers['content-type'] || '').toLowerCase().includes('application/json')) {
    json(res, 415, { error: 'json_required' })
    return false
  }
  if (activeTasks >= maxConcurrency) {
    json(res, 429, { error: 'worker_busy' })
    return false
  }
  return true
}

async function parseRequest(req, res) {
  try {
    return await readJson(req)
  } catch (error) {
    const code = error?.code === 'body_too_large' ? 413 : 400
    json(res, code, { error: error?.code || 'invalid_request' })
    return null
  }
}

async function handleInspect(req, res) {
  if (!authorizeJsonRequest(req, res)) return
  const payload = await parseRequest(req, res)
  if (payload == null) return

  const validation = validateInspectRequest(payload)
  if (!validation.ok) return json(res, 400, { error: validation.reason })

  activeTasks += 1
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
    activeTasks -= 1
  }
}

async function handlePrefill(req, res) {
  if (!authorizeJsonRequest(req, res)) return
  const payload = await parseRequest(req, res)
  if (payload == null) return

  const validation = validatePrefillRequest(payload)
  if (!validation.ok) return json(res, 400, { error: validation.reason })

  activeTasks += 1
  const started = Date.now()
  try {
    const prefill = await prefillApplicationPage(validation, { timeoutMs: inspectTimeoutMs })
    console.info('browser prefill complete', {
      requestId: validation.requestId,
      connectorId: validation.connectorId,
      filledCount: prefill.metadata.filledCount,
      rejectedCount: prefill.metadata.rejectedCount,
      retainedSession: true,
      latencyMs: Date.now() - started,
    })
    return json(res, 200, prefill)
  } catch (error) {
    const code = error?.code || error?.name || 'Error'
    console.error('browser prefill failed', {
      requestId: validation.requestId,
      connectorId: validation.connectorId,
      code,
      latencyMs: Date.now() - started,
    })

    if (code === 'navigation_scope_violation' || code === 'manual_checkpoint_required') {
      return json(res, 409, { error: code })
    }
    return json(res, 502, { error: 'prefill_failed' })
  } finally {
    activeTasks -= 1
  }
}

async function handleSubmit(req, res) {
  if (!authorizeJsonRequest(req, res)) return
  const payload = await parseRequest(req, res)
  if (payload == null) return

  const validation = validateSubmitRequest(payload)
  if (!validation.ok) return json(res, 400, { error: validation.reason })

  activeTasks += 1
  const started = Date.now()
  try {
    const outcome = await submitPrefilledApplication(validation)
    console.info('browser submit complete', {
      requestId: validation.requestId,
      connectorId: validation.connectorId,
      status: outcome.status,
      attempted: outcome.attempted,
      confirmed: outcome.confirmed,
      postRequestCount: outcome.network.postRequestCount,
      blockedRequestCount: outcome.network.blockedRequestCount,
      sessionClosed: outcome.sessionClosed,
      latencyMs: Date.now() - started,
    })
    return json(res, 200, outcome)
  } catch (error) {
    const code = error?.code || error?.name || 'Error'
    console.error('browser submit failed', {
      requestId: validation.requestId,
      connectorId: validation.connectorId,
      code,
      latencyMs: Date.now() - started,
    })
    const conflict = [
      'submit_session_invalid',
      'submit_session_not_found',
      'submit_session_expired',
      'submit_approval_replayed',
      'submit_session_busy_or_consumed',
      'submit_session_connector_mismatch',
      'submit_session_url_mismatch',
      'submit_session_already_attempted',
      'submit_session_not_frozen',
    ].includes(code)
    return json(res, conflict ? 409 : 502, { error: conflict ? code : 'submit_failed' })
  } finally {
    activeTasks -= 1
  }
}

async function handleCloseSession(req, res) {
  if (!authorizeJsonRequest(req, res)) return
  const payload = await parseRequest(req, res)
  if (payload == null) return
  const closed = await closePrefillSession(payload.sessionId)
  return json(res, closed ? 200 : 404, closed ? { closed: true } : { error: 'prefill_session_not_found' })
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://worker.local')

  if (req.method === 'GET' && url.pathname === '/health') {
    return json(res, 200, {
      ok: true,
      service: 'offerclaw-browser-worker',
      version: SUBMIT_WORKER_VERSION,
      prefillVersion: PREFILL_WORKER_VERSION,
      inspectionVersion: WORKER_VERSION,
      mode: 'inspection_prefill_submit_once',
      configured: Boolean(expectedToken),
      connectors: WORKER_CONNECTORS,
      prefillAllowed: true,
      prefillReviewSession: true,
      submitOnceAllowed: true,
      submitAllowed: true,
      activeTasks,
      activePrefillSessions: prefillSessionStats().active,
      maxConcurrency,
    })
  }

  if (req.method === 'POST' && url.pathname === '/v1/inspect') return handleInspect(req, res)
  if (req.method === 'POST' && url.pathname === '/v1/prefill') return handlePrefill(req, res)
  if (req.method === 'POST' && url.pathname === '/v1/submit') return handleSubmit(req, res)
  if (req.method === 'POST' && url.pathname === '/v1/session/close') return handleCloseSession(req, res)

  return json(res, 404, { error: 'not_found' })
})

server.listen(port, '0.0.0.0', () => {
  console.info(`OfferClaw browser worker listening on :${port}`)
})

async function shutdown() {
  server.close()
  await closeAllPrefillSessions()
  await Promise.all([
    closeBrowser(),
    closePrefillBrowser(),
  ])
}

globalThis.process?.once('SIGTERM', shutdown)
globalThis.process?.once('SIGINT', shutdown)
