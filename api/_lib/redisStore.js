function clean(value, max = 4_000) {
  return String(value || '').trim().slice(0, max)
}

function secureRedisUrl(value) {
  const raw = clean(value, 2_000)
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:') return null
    url.username = ''
    url.password = ''
    url.hash = ''
    url.search = ''
    return url.toString().replace(/\/+$/, '')
  } catch {
    return null
  }
}

export function getRedisStoreConfig(env = {}) {
  const url = secureRedisUrl(env.UPSTASH_REDIS_REST_URL)
  const token = clean(env.UPSTASH_REDIS_REST_TOKEN, 8_000)
  return {
    configured: Boolean(url && token),
    url,
    token: token || null,
    timeoutMs: Math.min(10_000, Math.max(2_000, Number(env.UPSTASH_REDIS_TIMEOUT_MS) || 5_000)),
  }
}

export function publicRedisStoreRuntime(config) {
  return {
    configured: Boolean(config?.configured),
    provider: 'upstash_redis_rest',
    scope: 'device_identity',
  }
}

export async function redisCommand(config, command, fetchImpl = globalThis.fetch) {
  if (!config?.configured || !config.url || !config.token) throw new Error('redis_not_configured')
  if (!Array.isArray(command) || !command.length) throw new Error('redis_invalid_command')

  const response = await fetchImpl(config.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(command),
    redirect: 'error',
    signal: AbortSignal.timeout(config.timeoutMs),
  })

  if (!response.ok) throw new Error(`redis_http_${response.status}`)
  const contentType = response.headers?.get?.('content-type') || ''
  if (!contentType.includes('application/json')) throw new Error('redis_invalid_response')

  const data = await response.json()
  if (data?.error) throw new Error('redis_command_failed')
  return data?.result
}

export async function readScoutRecord(config, stateKey, revisionKey, fetchImpl = globalThis.fetch) {
  const result = await redisCommand(config, ['MGET', stateKey, revisionKey], fetchImpl)
  const [rawState, rawRevision] = Array.isArray(result) ? result : [null, null]

  let state = null
  if (rawState) {
    try {
      state = JSON.parse(rawState)
    } catch {
      throw new Error('redis_state_corrupt')
    }
  }

  const revision = Number(rawRevision || 0)
  return {
    state,
    revision: Number.isInteger(revision) && revision >= 0 ? revision : 0,
  }
}

const CAS_SCRIPT = `
local current = tonumber(redis.call('GET', KEYS[2]) or '0')
local expected = tonumber(ARGV[1])
if current ~= expected then
  return {0, current}
end
local next = current + 1
redis.call('SET', KEYS[1], ARGV[2])
redis.call('SET', KEYS[2], tostring(next))
return {1, next}
`.trim()

export async function compareAndSetScoutRecord(
  config,
  stateKey,
  revisionKey,
  expectedRevision,
  state,
  fetchImpl = globalThis.fetch,
) {
  const expected = Number(expectedRevision)
  if (!Number.isInteger(expected) || expected < 0) throw new Error('invalid_expected_revision')

  const result = await redisCommand(config, [
    'EVAL',
    CAS_SCRIPT,
    2,
    stateKey,
    revisionKey,
    expected,
    JSON.stringify(state),
  ], fetchImpl)

  const [written, revision] = Array.isArray(result) ? result : [0, expected]
  return {
    written: Number(written) === 1,
    revision: Number.isInteger(Number(revision)) ? Number(revision) : expected,
  }
}

export async function deleteScoutRecord(config, stateKey, revisionKey, fetchImpl = globalThis.fetch) {
  const result = await redisCommand(config, ['DEL', stateKey, revisionKey], fetchImpl)
  return Number(result || 0)
}
