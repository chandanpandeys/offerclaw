import { getBrowserWorkerConfig, publicBrowserWorkerRuntime } from './_lib/browserGateway.js'
import { getDeviceIdentityConfig, publicDeviceIdentityRuntime } from './_lib/deviceIdentity.js'
import { getJobRuntimeConfig, publicJobRuntime } from './_lib/jobSources.js'
import { getRedisStoreConfig, publicRedisStoreRuntime } from './_lib/redisStore.js'
import { getAiRuntimeConfig, publicAiRuntime } from './_lib/runtime.js'

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
    version: '1.6',
    runtime: 'vercel-functions',
    ai: publicAiRuntime(ai),
    jobs: publicJobRuntime(jobs),
    browserWorker: publicBrowserWorkerRuntime(browserWorker),
    identity: publicDeviceIdentityRuntime(identity),
    scoutStore: publicRedisStoreRuntime(scoutStore),
    privacy: {
      browserSecrets: false,
      aiStoreDisabled: true,
      gatewayZeroDataRetention: ai.providers.gateway.zeroDataRetention,
      identityProfileDataInToken: false,
      scoutCloudScope: 'goals_and_compact_runs_only',
    },
    observability: {
      requestIds: true,
      promptLogging: false,
      responseLogging: false,
      browserPageLogging: false,
      identityTokenLogging: false,
      scoutPayloadLogging: false,
    },
  })
}
