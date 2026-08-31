import test from 'node:test'
import assert from 'node:assert/strict'

import handler from '../api/health.js'

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

test('health exposes only public anonymous identity readiness', async () => {
  await withEnv({ OFFERCLAW_IDENTITY_SECRET: SECRET }, async () => {
    const res = mockResponse()
    handler({ method: 'GET' }, res)

    assert.equal(res.statusCode, 200)
    assert.equal(res.body.version, '1.5')
    assert.equal(res.body.identity.configured, true)
    assert.equal(res.body.identity.type, 'anonymous_device')
    assert.equal(res.body.identity.profileDataInToken, false)
    assert.equal(Object.hasOwn(res.body.identity, 'secret'), false)
    assert.equal(Object.hasOwn(res.body.identity, 'subject'), false)
    assert.equal(res.body.privacy.identityProfileDataInToken, false)
    assert.equal(res.body.observability.identityTokenLogging, false)
    assert.equal(res.headers['cache-control'], 'no-store')
  })
})

test('health method contract remains GET-only', () => {
  const res = mockResponse()
  handler({ method: 'POST' }, res)
  assert.equal(res.statusCode, 405)
  assert.equal(res.headers.allow, 'GET')
})
