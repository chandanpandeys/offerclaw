import test from 'node:test'
import assert from 'node:assert/strict'

import handler from '../api/browser/prefill-session.js'

const SESSION_ID = 'abcdefghijklmnopqrstuvwxyzABCDEFGH12345678'

function mockResponse() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value },
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

async function withEnv(values, fn) {
  const env = globalThis.process.env
  const previous = {}
  for (const [key, value] of Object.entries(values)) {
    previous[key] = env[key]
    if (value == null) delete env[key]
    else env[key] = value
  }
  try { return await fn() } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) delete env[key]
      else env[key] = value
    }
  }
}

function request(body, origin = 'https://offerclaw.example') {
  return {
    method: 'DELETE',
    body,
    headers: { origin, host: 'offerclaw.example' },
  }
}

test('invalid session IDs are rejected before worker access', async () => {
  const originalFetch = globalThis.fetch
  let called = false
  globalThis.fetch = async () => { called = true; throw new Error('should not run') }
  try {
    await withEnv({ BROWSER_WORKER_URL: 'https://worker.example', BROWSER_WORKER_TOKEN: 'secret' }, async () => {
      const res = mockResponse()
      await handler(request({ sessionId: 'short' }), res)
      assert.equal(res.statusCode, 400)
      assert.equal(res.body.error, 'invalid_prefill_session_id')
      assert.equal(called, false)
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('cross-origin cancellation is rejected before worker access', async () => {
  const originalFetch = globalThis.fetch
  let called = false
  globalThis.fetch = async () => { called = true; throw new Error('should not run') }
  try {
    const res = mockResponse()
    await handler(request({ sessionId: SESSION_ID }, 'https://evil.example'), res)
    assert.equal(res.statusCode, 403)
    assert.equal(res.body.error, 'browser_prefill_origin_rejected')
    assert.equal(called, false)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('valid cancellation forwards only the opaque session capability with server bearer token', async () => {
  const originalFetch = globalThis.fetch
  let captured
  globalThis.fetch = async (url, options) => {
    captured = { url: String(url), options }
    return { ok: true, status: 200 }
  }

  try {
    await withEnv({ BROWSER_WORKER_URL: 'https://worker.example/base', BROWSER_WORKER_TOKEN: 'worker-secret' }, async () => {
      const res = mockResponse()
      await handler(request({ sessionId: SESSION_ID }), res)
      assert.equal(res.statusCode, 200)
      assert.deepEqual(res.body, { closed: true })
      assert.equal(captured.url, 'https://worker.example/base/v1/session/close')
      assert.equal(captured.options.redirect, 'error')
      assert.equal(captured.options.headers.Authorization, 'Bearer worker-secret')
      assert.deepEqual(JSON.parse(captured.options.body), { sessionId: SESSION_ID })
      assert.equal(JSON.stringify(res.body).includes('worker-secret'), false)
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})
