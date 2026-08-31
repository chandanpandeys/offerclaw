import { getAiRuntimeConfig, publicAiRuntime } from './_lib/runtime.js'

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const env = globalThis.process?.env || {}
  const ai = getAiRuntimeConfig(env)

  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).json({
    ok: true,
    version: '1.2',
    runtime: 'vercel-functions',
    ai: publicAiRuntime(ai),
    jobs: {
      configured: Boolean(env.JSEARCH_API_KEY || env.RAPIDAPI_KEY),
      provider: 'jsearch',
    },
    privacy: {
      browserSecrets: false,
      aiStoreDisabled: true,
      gatewayZeroDataRetention: ai.providers.gateway.zeroDataRetention,
    },
    observability: {
      requestIds: true,
      promptLogging: false,
      responseLogging: false,
    },
  })
}
