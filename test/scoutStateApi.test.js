import test from 'node:test'
import assert from 'node:assert/strict'

import handler from '../api/scout/state.js'
import {
  createDeviceToken,
  getDeviceIdentityConfig,
} from '../api/_lib/deviceIdentity.js'

const SECRET = 'test-secret-that-is-long-enough-for-device-identity-123456'
const REDIS_URL = 'https://redis.example'
const REDIS_TOKEN = 'redis-secret'

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

function identityCookie() {
  const config = getDeviceIdentityConfig({
    OFFERCLAW_IDENTITY_SECRET: SECRET,
    IDENTITY_COOKIE_SECURE: 'false',
  })
  const token = createDeviceToken(config, Date.now(), 'abcdefghijklmnopqrstuvwx12345678')
  return `offerclaw_device=${encodeURIComponent(token)}`
}

function request(method, body = null, options = {}) {
  return {
    method,
    body,
    headers: {
      host: 'offerclaw.example',
      origin: 'https://offerclaw.example',
      cookie: options.cookie === undefined ? identityCookie() : options.cookie,
      ...options.headers,
    },
  }
}

function fakeRedis() {
  const data = new Map()
  const calls = []

  const fetchImpl = async (_url, options) => {
    const command = JSON.parse(options.body)
    calls.push(command)
    let result = null

    if (command[0] === 'MGET') {
      result = command.slice(1).map(key => data.has(key) ? data.get(key) : null)
    } else if (command[0] === 'EVAL') {
      const stateKey = command[3]
      const revisionKey = command[4]
      const expected = Number(command[5])
      const state = command[6]
      const current = Number(data.get(revisionKey) || 0)
      if (current !== expected) {
        result = [0, current]
      } else {
        const next = current + 1
        data.set(stateKey, state)
        data.set(revisionKey, String(next))
        result = [1, next]
      }
    } else if (command[0] === 'DEL') {
      let deleted = 0
      for (const key of command.slice(1)) {
        if (data.delete(key)) deleted += 1
      }
      result = deleted
    } else {
      throw new Error(`unsupported fake redis command ${command[0]}`)
    }

    return {
      ok: true,
      status: 200,
      headers: { get: name => name.toLowerCase() === 'content-type' ? 'application/json' : null },
      json: async () => ({ result }),
    }
  }

  return { data, calls, fetchImpl }
}

async function withRuntime(fn) {
  return withEnv({
    OFFERCLAW_IDENTITY_SECRET: SECRET,
    IDENTITY_COOKIE_SECURE: 'false',
    UPSTASH_REDIS_REST_URL: REDIS_URL,
    UPSTASH_REDIS_REST_TOKEN: REDIS_TOKEN,
  }, fn)
}

test('missing device identity is rejected before Redis access', async () => {
  await withRuntime(async () => {
    const originalFetch = globalThis.fetch
    let called = false
    globalThis.fetch = async () => { called = true; throw new Error('should not run') }
    try {
      const res = mockResponse()
      await handler(request('GET', null, { cookie: '' }), res)
      assert.equal(res.statusCode, 401)
      assert.equal(res.body.error, 'device_identity_required')
      assert.equal(called, false)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

test('identity-scoped PUT normalizes state, then GET returns revisioned durable data', async () => {
  await withRuntime(async () => {
    const originalFetch = globalThis.fetch
    const redis = fakeRedis()
    globalThis.fetch = redis.fetchImpl
    try {
      const putRes = mockResponse()
      await handler(request('PUT', {
        expectedRevision: 0,
        state: {
          secret: 'drop-me',
          goals: [{ id: 'goal-1', name: 'AI roles', query: 'AI Engineer', location: 'India', secret: 'drop-me' }],
          runs: [{
            id: 'run-1',
            goalId: 'goal-1',
            goalName: 'AI roles',
            ranAt: '2026-09-01T00:00:00Z',
            results: [{ title: 'Role', company: 'Example', description: 'drop-me' }],
          }],
        },
      }), putRes)

      assert.equal(putRes.statusCode, 200)
      assert.equal(putRes.body.revision, 1)
      assert.equal(Object.hasOwn(putRes.body.state, 'secret'), false)
      assert.equal(Object.hasOwn(putRes.body.state.goals[0], 'secret'), false)
      assert.equal(Object.hasOwn(putRes.body.state.runs[0].results[0], 'description'), false)

      const getRes = mockResponse()
      await handler(request('GET'), getRes)
      assert.equal(getRes.statusCode, 200)
      assert.equal(getRes.body.revision, 1)
      assert.equal(getRes.body.state.goals[0].id, 'goal-1')
      assert.equal(redis.calls[0][0], 'EVAL')
      assert.equal(redis.calls[1][0], 'MGET')

      const storageKey = redis.calls[0][3]
      assert.match(storageKey, /^offerclaw:v1:device:/)
      assert.equal(storageKey.includes('goal-1'), false)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

test('stale revision returns conflict instead of overwriting durable state', async () => {
  await withRuntime(async () => {
    const originalFetch = globalThis.fetch
    const redis = fakeRedis()
    globalThis.fetch = redis.fetchImpl
    try {
      const first = mockResponse()
      await handler(request('PUT', { expectedRevision: 0, state: { goals: [], runs: [] } }), first)
      assert.equal(first.body.revision, 1)

      const stale = mockResponse()
      await handler(request('PUT', {
        expectedRevision: 0,
        state: { goals: [{ id: 'stale', query: 'stale' }], runs: [] },
      }), stale)
      assert.equal(stale.statusCode, 409)
      assert.equal(stale.body.error, 'scout_state_revision_conflict')
      assert.equal(stale.body.currentRevision, 1)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

test('foreign-origin mutations are rejected before Redis access', async () => {
  await withRuntime(async () => {
    const originalFetch = globalThis.fetch
    let called = false
    globalThis.fetch = async () => { called = true; throw new Error('should not run') }
    try {
      const res = mockResponse()
      await handler(request('PUT', { expectedRevision: 0, state: {} }, {
        headers: { origin: 'https://evil.example' },
      }), res)
      assert.equal(res.statusCode, 403)
      assert.equal(res.body.error, 'scout_state_origin_rejected')
      assert.equal(called, false)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

test('DELETE clears only the verified device scout namespace', async () => {
  await withRuntime(async () => {
    const originalFetch = globalThis.fetch
    const redis = fakeRedis()
    globalThis.fetch = redis.fetchImpl
    try {
      const first = mockResponse()
      await handler(request('PUT', { expectedRevision: 0, state: { goals: [], runs: [] } }), first)

      const res = mockResponse()
      await handler(request('DELETE'), res)
      assert.equal(res.statusCode, 200)
      assert.equal(res.body.deleted, true)
      assert.equal(res.body.revision, 0)
      assert.equal(redis.calls.at(-1)[0], 'DEL')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
