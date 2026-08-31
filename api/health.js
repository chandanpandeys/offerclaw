import { getBrowserWorkerConfig, publicBrowserWorkerRuntime } from './_lib/browserGateway.js'
import { getJobRuntimeConfig, publicJobRuntime } from './_lib/jobSources.js'
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

  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).json({
    ok: true,
    version: '1.4',
    runtime: 'vercel-functions',
    ai: publicAiRuntime(ai),
    jobs: publicJobRuntime(jobs),
    browserWorker: publicBrowserWorkerRuntime(browserWorker),
    privacy: {
      browserSecrets: false,
      aiStoreDisabled: true,
      gatewayZeroDataRetention: ai.providers.gateway.zeroDataRetention,
    },
    observability: {
      requestIds: true,
      promptLogging: false,
      responseLogging: false,
      browserPageLogging: false,
    },
  })
}
