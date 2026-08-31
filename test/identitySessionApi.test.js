import test from 'node:test'
import assert from 'node:assert/strict'

import handler from '../api/identity/session.js'

const SECRET = 'test-secret-that-is-long-enough-for-device-identity-123456'

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
  try {
    return await fn()
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) delete env[key]
      else env[key] = value
    }
  }
}

function request(method, headers = {}) {
  return {
    method,
    headers: {
      host: 'offerclaw.example',
      origin: 'https://offerclaw.example',
      ...headers,
    },
  }
}

test('POST creates an anonymous HttpOnly session without exposing token or subject in JSON', async () => {
  await withEnv({ OFFERCLAW_IDENTITY_SECRET: SECRET, IDENTITY_COOKIE_SECURE: 'false' }, async () => {
    const res = mockResponse()
    handler(request('POST'), res)

    assert.equal(res.statusCode, 201)
    assert.equal(res.body.configured, true)
    assert.equal(res.body.active, true)
    assert.equal(res.body.type, 'anonymous_device')
    assert.equal(Object.hasOwn(res.body, 'token'), false)
    assert.equal(Object.hasOwn(res.body, 'subject'), false)
    assert.match(res.headers['set-cookie'], /offerclaw_device=/)
    assert.match(res.headers['set-cookie'], /HttpOnly/)
    assert.equal(res.headers['cache-control'], 'no-store')
  })
})

test('GET reports active session using only the HttpOnly cookie', async () => {
  await withEnv({ OFFERCLAW_IDENTITY_SECRET: SECRET, IDENTITY_COOKIE_SECURE: 'false' }, async () => {
    const createRes = mockResponse()
    handler(request('POST'), createRes)
    const cookie = createRes.headers['set-cookie'].split(';')[0]

    const res = mockResponse()
    handler(request('GET', { cookie, origin: undefined }), res)

    assert.equal(res.statusCode, 200)
    assert.equal(res.body.active, true)
    assert.ok(res.body.expiresAt)
    assert.equal(Object.hasOwn(res.body, 'token'), false)
    assert.equal(Object.hasOwn(res.body, 'subject'), false)
  })
})

test('cross-origin POST and DELETE are rejected before session mutation', async () => {
  await withEnv({ OFFERCLAW_IDENTITY_SECRET: SECRET, IDENTITY_COOKIE_SECURE: 'false' }, async () => {
    for (const method of ['POST', 'DELETE']) {
      const res = mockResponse()
      handler(request(method, { origin: 'https://evil.example' }), res)
      assert.equal(res.statusCode, 403)
      assert.equal(res.body.error, 'identity_origin_rejected')
      assert.equal(Object.hasOwn(res.headers, 'set-cookie'), false)
    }
  })
})

test('POST fails closed when identity secret is not configured', async () => {
  await withEnv({ OFFERCLAW_IDENTITY_SECRET: null, IDENTITY_COOKIE_SECURE: 'false' }, async () => {
    const res = mockResponse()
    handler(request('POST'), res)
    assert.equal(res.statusCode, 503)
    assert.equal(res.body.error, 'identity_not_configured')
    assert.equal(Object.hasOwn(res.headers, 'set-cookie'), false)
  })
})

test('DELETE clears the local device cookie', async () => {
  await withEnv({ OFFERCLAW_IDENTITY_SECRET: SECRET, IDENTITY_COOKIE_SECURE: 'false' }, async () => {
    const res = mockResponse()
    handler(request('DELETE'), res)

    assert.equal(res.statusCode, 200)
    assert.equal(res.body.active, false)
    assert.match(res.headers['set-cookie'], /Max-Age=0/)
  })
})

test('unsupported methods advertise the session contract', async () => {
  await withEnv({ OFFERCLAW_IDENTITY_SECRET: SECRET }, async () => {
    const res = mockResponse()
    handler(request('PUT'), res)
    assert.equal(res.statusCode, 405)
    assert.equal(res.headers.allow, 'GET, POST, DELETE')
  })
})
