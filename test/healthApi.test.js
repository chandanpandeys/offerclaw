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

test('health exposes only public identity store discovery and browser capabilities', async () => {
  await withEnv({
    OFFERCLAW_IDENTITY_SECRET: SECRET,
    UPSTASH_REDIS_REST_URL: 'https://redis.example',
    UPSTASH_REDIS_REST_TOKEN: 'secret-token',
    JSEARCH_API_KEY: 'jobs-secret',
    CRON_SECRET: 'cron-secret-long-enough-123456',
    BROWSER_WORKER_URL: 'https://worker.example',
    BROWSER_WORKER_TOKEN: 'browser-worker-secret',
  }, async () => {
    const res = mockResponse()
    handler({ method: 'GET' }, res)

    assert.equal(res.statusCode, 200)
    assert.equal(res.body.version, '1.8')
    assert.equal(res.body.identity.configured, true)
    assert.equal(res.body.identity.type, 'anonymous_device')
    assert.equal(res.body.identity.profileDataInToken, false)
    assert.equal(Object.hasOwn(res.body.identity, 'secret'), false)
    assert.equal(Object.hasOwn(res.body.identity, 'subject'), false)

    assert.equal(res.body.browserWorker.configured, true)
    assert.equal(res.body.browserWorker.mode, 'inspection_prefill_submit_once')
    assert.equal(res.body.browserWorker.prefillAllowed, true)
    assert.equal(res.body.browserWorker.prefillReviewSession, true)
    assert.equal(res.body.browserWorker.submitOnceAllowed, true)
    assert.equal(res.body.browserWorker.submitAllowed, true)
    assert.equal(Object.hasOwn(res.body.browserWorker, 'url'), false)
    assert.equal(Object.hasOwn(res.body.browserWorker, 'token'), false)
    assert.equal(JSON.stringify(res.body.browserWorker).includes('worker.example'), false)
    assert.equal(JSON.stringify(res.body.browserWorker).includes('browser-worker-secret'), false)

    assert.equal(res.body.scoutStore.configured, true)
    assert.equal(res.body.scoutStore.provider, 'upstash_redis_rest')
    assert.equal(res.body.scoutStore.scope, 'device_identity')
    assert.equal(Object.hasOwn(res.body.scoutStore, 'token'), false)
    assert.equal(Object.hasOwn(res.body.scoutStore, 'url'), false)

    assert.deepEqual(res.body.backgroundScout, {
      configured: true,
      schedule: 'daily',
      mode: 'discovery_only',
      personalizedServerRanking: false,
    })
    assert.equal(Object.hasOwn(res.body.backgroundScout, 'secret'), false)

    assert.equal(res.body.privacy.identityProfileDataInToken, false)
    assert.equal(res.body.privacy.scoutCloudScope, 'goals_and_compact_runs_only')
    assert.equal(res.body.privacy.backgroundScoutProfileUpload, false)
    assert.equal(res.body.privacy.submitRequestBodiesReturned, false)
    assert.equal(res.body.privacy.submitResponseBodiesReturned, false)
    assert.equal(res.body.observability.browserSubmitBodyLogging, false)
    assert.equal(res.body.observability.identityTokenLogging, false)
    assert.equal(res.body.observability.scoutPayloadLogging, false)
    assert.equal(res.body.observability.cronPayloadLogging, false)
    assert.equal(res.headers['cache-control'], 'no-store')
  })
})

test('background scout readiness stays false without a sufficiently strong cron secret', async () => {
  await withEnv({
    UPSTASH_REDIS_REST_URL: 'https://redis.example',
    UPSTASH_REDIS_REST_TOKEN: 'secret-token',
    JSEARCH_API_KEY: 'jobs-secret',
    CRON_SECRET: 'short',
  }, async () => {
    const res = mockResponse()
    handler({ method: 'GET' }, res)
    assert.equal(res.body.backgroundScout.configured, false)
  })
})

test('health method contract remains GET-only', () => {
  const res = mockResponse()
  handler({ method: 'POST' }, res)
  assert.equal(res.statusCode, 405)
  assert.equal(res.headers.allow, 'GET')
})
