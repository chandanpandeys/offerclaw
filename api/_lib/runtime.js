export const DEFAULT_GEMINI_MODEL = 'gemini-3.7-flash'
export const DEFAULT_GATEWAY_MODEL = 'google/gemini-3.7-flash'

export function splitCsv(value) {
  return [...new Set(String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean))]
}

export function getGatewayToken(env = {}) {
  return env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN || ''
}

export function getAiRuntimeConfig(env = {}) {
  const geminiConfigured = Boolean(env.GEMINI_API_KEY || env.GOOGLE_API_KEY)
  const gatewayConfigured = Boolean(getGatewayToken(env))
  const gatewayFallbackModels = splitCsv(env.AI_GATEWAY_FALLBACK_MODELS)
  const gatewayProviderOrder = splitCsv(env.AI_GATEWAY_PROVIDER_ORDER)

  return {
    configured: geminiConfigured || gatewayConfigured,
    primary: geminiConfigured ? 'gemini-direct' : gatewayConfigured ? 'vercel-ai-gateway' : 'template',
    model: geminiConfigured
      ? env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL
      : env.AI_GATEWAY_MODEL || DEFAULT_GATEWAY_MODEL,
    api: geminiConfigured ? 'interactions' : gatewayConfigured ? 'ai-gateway-chat-completions' : 'template',
    providers: {
      gemini: {
        configured: geminiConfigured,
        model: env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
      },
      gateway: {
        configured: gatewayConfigured,
        model: env.AI_GATEWAY_MODEL || DEFAULT_GATEWAY_MODEL,
        fallbackModels: gatewayFallbackModels,
        providerOrder: gatewayProviderOrder,
        zeroDataRetention: String(env.AI_GATEWAY_ZDR || 'true').toLowerCase() !== 'false',
      },
    },
  }
}

export function isRetryableProviderStatus(status) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500
}

export function publicAiRuntime(config) {
  return {
    configured: config.configured,
    primary: config.primary,
    model: config.model,
    api: config.api,
    providers: {
      gemini: {
        configured: config.providers.gemini.configured,
        model: config.providers.gemini.model,
      },
      gateway: {
        configured: config.providers.gateway.configured,
        model: config.providers.gateway.model,
        fallbackCount: config.providers.gateway.fallbackModels.length,
        providerOrder: config.providers.gateway.providerOrder,
        zeroDataRetention: config.providers.gateway.zeroDataRetention,
      },
    },
  }
}
