import test from 'node:test'
import assert from 'node:assert/strict'

import handler from '../api/cron/scout.js'
import { SCOUT_SCHEDULE_INDEX_KEY } from '../api/_lib/redisStore.js'

const CRON_SECRET = 'cron-secret-long-enough-123456'
const REDIS_URL = 'https://redis.example'
const REDIS_TOKEN = 'redis-token'
const NAMESPACE = 'offerclaw:v1:device:abcdefghijklmnopqrstuvwx12345678'

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

function request(auth = `Bearer ${CRON_SECRET}`) {
  return { method: 'GET', headers: { authorization: auth } }
}

function redisAndJobsFetch() {
  const stateKey = `${NAMESPACE}:scout:state`
  const revisionKey = `${NAMESPACE}:scout:revision`
  const state = {
    version: 1,
    updatedAt: '2026-08-30T00:00:00Z',
    goals: [{
      id: 'goal-1',
      name: 'Private target name',
      query: 'AI Engineer',
      location: 'India',
      freshnessHours: 72,
      maxResults: 5,
      cadence: 'daily',
      enabled: true,
      createdAt: '2026-08-29T00:00:00Z',
      updatedAt: '2026-08-29T00:00:00Z',
      lastRunAt: '2026-08-29T00:00:00Z',
    }],
    runs: [],
  }
  const redis = new Map([
    [stateKey, JSON.stringify(state)],
    [revisionKey, '4'],
  ])
  const schedule = new Map([[NAMESPACE, 0]])
  const calls = []

  const fetchImpl = async (url, options = {}) => {
    const href = String(url)
    calls.push({ href, options })

    if (href.startsWith(REDIS_URL)) {
      const command = JSON.parse(options.body)
      let result

      if (command[0] === 'ZRANGEBYSCORE') {
        assert.equal(command[1], SCOUT_SCHEDULE_INDEX_KEY)
        result = [...schedule.entries()]
          .filter(([, score]) => Number(score) <= Number(command[3]))
          .map(([member]) => member)
          .slice(0, Number(command[6]))
      } else if (command[0] === 'MGET') {
        result = command.slice(1).map(key => redis.get(key) ?? null)
      } else if (command[0] === 'EVAL' && command.length >= 10) {
        const casStateKey = command[3]
        const casRevisionKey = command[4]
        const current = Number(redis.get(casRevisionKey) || 0)
        const expected = Number(command[6])
        if (current !== expected) {
          result = [0, current]
        } else {
          const next = current + 1
          redis.set(casStateKey, command[7])
          redis.set(casRevisionKey, String(next))
          const member = command[8]
          const dueScore = Number(command[9])
          if (member) {
            if (dueScore >= 0) schedule.set(member, dueScore)
            else schedule.delete(member)
          }
          result = [1, next]
        }
      } else if (command[0] === 'ZREM') {
        schedule.delete(command[2])
        result = 1
      } else if (command[0] === 'ZADD') {
        schedule.set(command[3], Number(command[2]))
        result = 1
      } else {
        throw new Error(`unexpected redis command ${command[0]}`)
      }

      return {
        ok: true,
        status: 200,
        headers: { get: name => name.toLowerCase() === 'content-type' ? 'application/json' : null },
        json: async () => ({ result }),
      }
    }

    if (href.startsWith('https://jsearch.p.rapidapi.com/search')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [{
            job_id: 'job-private-title',
            job_title: 'Private Candidate Job Title',
            employer_name: 'Example Company',
            job_city: 'Bengaluru',
            job_country: 'India',
            job_posted_at_datetime_utc: new Date().toISOString(),
            job_apply_link: 'https://example.com/jobs/private',
            job_description: 'full job description should not appear in cron response',
          }],
        }),
      }
    }

    throw new Error(`unexpected fetch ${href}`)
  }

  return { fetchImpl, redis, schedule, calls, stateKey, revisionKey }
}

async function withCronRuntime(extra, fn) {
  return withEnv({
    CRON_SECRET,
    UPSTASH_REDIS_REST_URL: REDIS_URL,
    UPSTASH_REDIS_REST_TOKEN: REDIS_TOKEN,
    JSEARCH_API_KEY: 'jobs-secret',
    PUBLIC_ATS_SOURCES: null,
    ...extra,
  }, fn)
}

test('cron rejects missing or invalid authorization before any external call', async () => {
  await withCronRuntime({}, async () => {
    const originalFetch = globalThis.fetch
    let called = false
    globalThis.fetch = async () => { called = true; throw new Error('should not run') }
    try {
      const res = mockResponse()
      await handler(request('Bearer wrong-secret-value'), res)
      assert.equal(res.statusCode, 401)
      assert.equal(res.body.error, 'unauthorized')
      assert.equal(called, false)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

test('cron fails closed when CRON_SECRET is not configured strongly enough', async () => {
  await withCronRuntime({ CRON_SECRET: 'short' }, async () => {
    const originalFetch = globalThis.fetch
    let called = false
    globalThis.fetch = async () => { called = true; throw new Error('should not run') }
    try {
      const res = mockResponse()
      await handler(request('Bearer short'), res)
      assert.equal(res.statusCode, 503)
      assert.equal(res.body.error, 'cron_not_configured')
      assert.equal(called, false)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

test('valid daily cron stores a non-personalized discovery and returns metadata only', async () => {
  await withCronRuntime({}, async () => {
    const originalFetch = globalThis.fetch
    const runtime = redisAndJobsFetch()
    globalThis.fetch = runtime.fetchImpl
    try {
      const res = mockResponse()
      await handler(request(), res)

      assert.equal(res.statusCode, 200)
      assert.equal(res.body.ok, true)
      assert.equal(res.body.checked, 1)
      assert.equal(res.body.processed, 1)
      assert.equal(res.body.discovered, 1)
      assert.equal(res.body.providerFailures, 0)

      const serializedResponse = JSON.stringify(res.body)
      assert.equal(serializedResponse.includes(NAMESPACE), false)
      assert.equal(serializedResponse.includes('AI Engineer'), false)
      assert.equal(serializedResponse.includes('Private Candidate Job Title'), false)
      assert.equal(serializedResponse.includes('Example Company'), false)

      const saved = JSON.parse(runtime.redis.get(runtime.stateKey))
      assert.equal(saved.runs.length, 1)
      assert.equal(saved.runs[0].mode, 'background_discovery')
      assert.equal(saved.runs[0].personalized, false)
      assert.equal(saved.runs[0].results[0].matchScore, null)
      assert.equal(Object.hasOwn(saved.runs[0].results[0], 'description'), false)
      assert.equal(Number(runtime.redis.get(runtime.revisionKey)), 5)
      assert.equal(runtime.schedule.has(NAMESPACE), true)
      assert.ok(runtime.schedule.get(NAMESPACE) > Date.now())

      const jobsCall = runtime.calls.find(call => call.href.startsWith('https://jsearch.p.rapidapi.com/search'))
      const jobsUrl = new URL(jobsCall.href)
      assert.equal(jobsUrl.searchParams.get('query'), 'AI Engineer in India')
      assert.equal(jobsCall.options.headers['x-rapidapi-key'], 'jobs-secret')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

test('cron requires a configured jobs provider before scanning the schedule index', async () => {
  await withCronRuntime({ JSEARCH_API_KEY: null }, async () => {
    const originalFetch = globalThis.fetch
    let called = false
    globalThis.fetch = async () => { called = true; throw new Error('should not run') }
    try {
      const res = mockResponse()
      await handler(request(), res)
      assert.equal(res.statusCode, 503)
      assert.equal(res.body.error, 'jobs_not_configured')
      assert.equal(called, false)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
