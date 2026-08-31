import test from 'node:test'
import assert from 'node:assert/strict'

import {
  SCOUT_SCHEDULE_INDEX_KEY,
  compareAndSetScoutRecord,
  getRedisStoreConfig,
  listDueScoutNamespaces,
  publicRedisStoreRuntime,
  readScoutRecord,
  redisCommand,
} from '../api/_lib/redisStore.js'

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: name => name.toLowerCase() === 'content-type' ? 'application/json' : null },
    json: async () => payload,
  }
}

test('store config requires HTTPS URL plus bearer token and exposes no secrets publicly', () => {
  const disabled = getRedisStoreConfig({
    UPSTASH_REDIS_REST_URL: 'http://redis.example',
    UPSTASH_REDIS_REST_TOKEN: 'token',
  })
  assert.equal(disabled.configured, false)

  const enabled = getRedisStoreConfig({
    UPSTASH_REDIS_REST_URL: 'https://redis.example/',
    UPSTASH_REDIS_REST_TOKEN: 'secret-token',
  })
  assert.equal(enabled.configured, true)
  assert.equal(enabled.url, 'https://redis.example')

  const runtime = publicRedisStoreRuntime(enabled)
  assert.deepEqual(runtime, {
    configured: true,
    provider: 'upstash_redis_rest',
    scope: 'device_identity',
  })
  assert.equal(Object.hasOwn(runtime, 'token'), false)
  assert.equal(Object.hasOwn(runtime, 'url'), false)
})

test('redis command uses bearer auth, POST body commands and redirect blocking', async () => {
  const config = getRedisStoreConfig({
    UPSTASH_REDIS_REST_URL: 'https://redis.example',
    UPSTASH_REDIS_REST_TOKEN: 'secret-token',
  })
  let captured = null
  const fakeFetch = async (url, options) => {
    captured = { url, options }
    return jsonResponse({ result: 'value' })
  }

  const result = await redisCommand(config, ['GET', 'key'], fakeFetch)
  assert.equal(result, 'value')
  assert.equal(captured.url, 'https://redis.example')
  assert.equal(captured.options.method, 'POST')
  assert.equal(captured.options.redirect, 'error')
  assert.equal(captured.options.headers.Authorization, 'Bearer secret-token')
  assert.deepEqual(JSON.parse(captured.options.body), ['GET', 'key'])
})

test('read scout record parses state and revision from one MGET', async () => {
  const config = getRedisStoreConfig({
    UPSTASH_REDIS_REST_URL: 'https://redis.example',
    UPSTASH_REDIS_REST_TOKEN: 'secret-token',
  })
  const fakeFetch = async () => jsonResponse({
    result: [JSON.stringify({ version: 1, goals: [], runs: [] }), '7'],
  })

  const record = await readScoutRecord(config, 'state-key', 'revision-key', fakeFetch)
  assert.equal(record.revision, 7)
  assert.equal(record.state.version, 1)
})

test('compare-and-set updates state, revision and schedule in one atomic EVAL', async () => {
  const config = getRedisStoreConfig({
    UPSTASH_REDIS_REST_URL: 'https://redis.example',
    UPSTASH_REDIS_REST_TOKEN: 'secret-token',
  })
  let command = null
  const fakeFetch = async (_url, options) => {
    command = JSON.parse(options.body)
    return jsonResponse({ result: [1, 5] })
  }

  const result = await compareAndSetScoutRecord(
    config,
    'state-key',
    'revision-key',
    4,
    { version: 1, goals: [], runs: [] },
    { member: 'offerclaw:v1:device:abcdefghijklmnopqrstuvwx12345678', dueScore: 1_800_000_000_000 },
    fakeFetch,
  )

  assert.equal(command[0], 'EVAL')
  assert.equal(command[2], 3)
  assert.equal(command[3], 'state-key')
  assert.equal(command[4], 'revision-key')
  assert.equal(command[5], SCOUT_SCHEDULE_INDEX_KEY)
  assert.equal(command[6], 4)
  assert.equal(command[8], 'offerclaw:v1:device:abcdefghijklmnopqrstuvwx12345678')
  assert.equal(command[9], 1_800_000_000_000)
  assert.equal(result.written, true)
  assert.equal(result.revision, 5)
})

test('legacy compare-and-set call shape remains usable without schedule mutation', async () => {
  const config = getRedisStoreConfig({
    UPSTASH_REDIS_REST_URL: 'https://redis.example',
    UPSTASH_REDIS_REST_TOKEN: 'secret-token',
  })
  let command = null
  const fakeFetch = async (_url, options) => {
    command = JSON.parse(options.body)
    return jsonResponse({ result: [0, 5] })
  }

  const result = await compareAndSetScoutRecord(
    config,
    'state-key',
    'revision-key',
    4,
    { version: 1, goals: [], runs: [] },
    fakeFetch,
  )

  assert.equal(command[8], '')
  assert.equal(command[9], -1)
  assert.equal(result.written, false)
  assert.equal(result.revision, 5)
})

test('due namespace lookup is bounded by the global schedule index', async () => {
  const config = getRedisStoreConfig({
    UPSTASH_REDIS_REST_URL: 'https://redis.example',
    UPSTASH_REDIS_REST_TOKEN: 'secret-token',
  })
  let command = null
  const fakeFetch = async (_url, options) => {
    command = JSON.parse(options.body)
    return jsonResponse({ result: ['offerclaw:v1:device:abcdefghijklmnopqrstuvwx12345678'] })
  }

  const result = await listDueScoutNamespaces(config, 1_800_000_000_000, 10, fakeFetch)
  assert.equal(command[0], 'ZRANGEBYSCORE')
  assert.equal(command[1], SCOUT_SCHEDULE_INDEX_KEY)
  assert.equal(command[3], 1_800_000_000_000)
  assert.equal(command[4], 'LIMIT')
  assert.deepEqual(result, ['offerclaw:v1:device:abcdefghijklmnopqrstuvwx12345678'])
})
