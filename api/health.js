import { getBrowserWorkerConfig, publicBrowserWorkerRuntime } from './_lib/browserGateway.js'
import { getDeviceIdentityConfig, publicDeviceIdentityRuntime } from './_lib/deviceIdentity.js'
import { getJobRuntimeConfig, publicJobRuntime } from './_lib/jobSources.js'
import { getRedisStoreConfig, publicRedisStoreRuntime } from './_lib/redisStore.js'
import { getAiRuntimeConfig, publicAiRuntime } from './_lib/runtime.js'

function publicBackgroundScoutRuntime(env, jobs, scoutStore) {
  const cronConfigured = String(env.CRON_SECRET || '').trim().length >= 16
  const jobRuntime = publicJobRuntime(jobs)
  return {
    configured: Boolean(cronConfigured && scoutStore.configured && jobRuntime.configured),
    schedule: 'daily',
    mode: 'discovery_only',
    personalizedServerRanking: false,
  }
}

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const env = globalThis.process?.env || {}
  const ai = getAiRuntimeConfig(env)
  const jobs = getJobRuntimeConfig(env)
  const browserWorker = getBrowserWorkerConfig(env)
  const identity = getDeviceIdentityConfig(env)
  const scoutStore = getRedisStoreConfig(env)

  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).json({
    ok: true,
    version: '1.0.0',
    runtime: 'vercel-functions',
    ai: publicAiRuntime(ai),
    jobs: publicJobRuntime(jobs),
    browserWorker: publicBrowserWorkerRuntime(browserWorker),
    identity: publicDeviceIdentityRuntime(identity),
    scoutStore: publicRedisStoreRuntime(scoutStore),
    backgroundScout: publicBackgroundScoutRuntime(env, jobs, scoutStore),
    privacy: {
      browserSecrets: false,
      aiStoreDisabled: true,
      gatewayZeroDataRetention: ai.providers.gateway.zeroDataRetention,
      identityProfileDataInToken: false,
      scoutCloudScope: 'goals_and_compact_runs_only',
      backgroundScoutProfileUpload: false,
      submitRequestBodiesReturned: false,
      submitResponseBodiesReturned: false,
    },
    observability: {
      requestIds: true,
      promptLogging: false,
      responseLogging: false,
      browserPageLogging: false,
      browserSubmitBodyLogging: false,
      identityTokenLogging: false,
      scoutPayloadLogging: false,
      cronPayloadLogging: false,
    },
  })
}
