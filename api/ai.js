import {
  getAiRuntimeConfig,
  getGatewayToken,
  isRetryableProviderStatus,
} from './_lib/runtime.js'

const WINDOW_MS = 10 * 60 * 1000
const MAX_REQUESTS = 30
const buckets = new Map()

class ProviderFailure extends Error {
  constructor(provider, status, code) {
    super(code)
    this.name = 'ProviderFailure'
    this.provider = provider
    this.status = status
    this.code = code
    this.retryable = isRetryableProviderStatus(status)
  }
}

function getIp(req) {
  const forwarded = req.headers?.['x-forwarded-for']
  if (Array.isArray(forwarded)) return forwarded[0] || 'unknown'
  return String(forwarded || req.socket?.remoteAddress || 'unknown').split(',')[0].trim()
}

function withinRateLimit(req) {
  const now = Date.now()
  const ip = getIp(req)
  const current = buckets.get(ip)

  if (!current || now - current.startedAt > WINDOW_MS) {
    buckets.set(ip, { startedAt: now, count: 1 })
    return true
  }

  current.count += 1
  return current.count <= MAX_REQUESTS
}

function parseBody(req) {
  if (!req.body) return {}
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body) } catch { return {} }
  }
  return req.body
}

function requestId(req) {
  const incoming = String(req.headers?.['x-request-id'] || '').trim().slice(0, 120)
  if (incoming) return incoming
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `oc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function extractGeminiText(data) {
  if (typeof data?.output_text === 'string') return data.output_text

  for (const step of data?.steps || []) {
    if (step?.type !== 'model_output') continue
    for (const part of step.content || []) {
      if (part?.type === 'text' && typeof part.text === 'string') return part.text
    }
  }

  return ''
}

function extractGatewayText(data) {
  const content = data?.choices?.[0]?.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map(part => typeof part?.text === 'string' ? part.text : '')
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

function parseStructured(text, responseSchema) {
  if (!responseSchema || !text) return null
  try { return JSON.parse(text) } catch { return null }
}

async function callGemini({ env, prompt, systemPrompt, responseSchema, config }) {
  const apiKey = env.GEMINI_API_KEY || env.GOOGLE_API_KEY
  const model = config.providers.gemini.model
  const payload = {
    model,
    store: false,
    input: prompt,
    generation_config: {
      max_output_tokens: 2048,
    },
  }

  if (systemPrompt) payload.system_instruction = systemPrompt

  if (responseSchema) {
    payload.response_format = {
      type: 'text',
      mime_type: 'application/json',
      schema: responseSchema,
    }
  }

  const upstream = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
      'x-goog-api-client': 'offerclaw/1.2.0',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  })

  if (!upstream.ok) {
    throw new ProviderFailure(
      'gemini-direct',
      upstream.status,
      upstream.status === 429 ? 'provider_rate_limited' : 'gemini_provider_error',
    )
  }

  const data = await upstream.json()
  const text = extractGeminiText(data)
  if (!text) throw new ProviderFailure('gemini-direct', 502, 'empty_provider_response')

  return {
    text,
    structured: parseStructured(text, responseSchema),
    provider: 'gemini-direct',
    model,
    upstreamId: data.id || null,
    usage: data.usage || data.usageMetadata || null,
  }
}

async function callGateway({ env, prompt, systemPrompt, responseSchema, config }) {
  const token = getGatewayToken(env)
  const gateway = config.providers.gateway
  const messages = []
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
  messages.push({ role: 'user', content: prompt })

  const gatewayOptions = {}
  if (gateway.fallbackModels.length) gatewayOptions.models = gateway.fallbackModels
  if (gateway.providerOrder.length) gatewayOptions.order = gateway.providerOrder
  if (gateway.zeroDataRetention) gatewayOptions.zeroDataRetention = true

  const payload = {
    model: gateway.model,
    messages,
    stream: false,
    providerOptions: {
      gateway: gatewayOptions,
    },
  }

  if (responseSchema) {
    payload.response_format = {
      type: 'json_schema',
      json_schema: {
        name: 'offerclaw_output',
        description: 'Structured OfferClaw application output',
        schema: {
          ...responseSchema,
          additionalProperties: false,
        },
      },
    }
  }

  const upstream = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-vercel-ai-app-id': 'offerclaw',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  })

  if (!upstream.ok) {
    throw new ProviderFailure(
      'vercel-ai-gateway',
      upstream.status,
      upstream.status === 429 ? 'provider_rate_limited' : 'gateway_provider_error',
    )
  }

  const data = await upstream.json()
  const text = extractGatewayText(data)
  if (!text) throw new ProviderFailure('vercel-ai-gateway', 502, 'empty_provider_response')

  return {
    text,
    structured: parseStructured(text, responseSchema),
    provider: 'vercel-ai-gateway',
    model: data.model || gateway.model,
    upstreamId: data.id || null,
    usage: data.usage || null,
  }
}

function logEvent(event, data) {
  console.info(`offerclaw.${event}`, JSON.stringify(data))
}

export default async function handler(req, res) {
  const id = requestId(req)
  const startedAt = Date.now()
  res.setHeader('X-OfferClaw-Request-Id', id)
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method_not_allowed', requestId: id })
  }

  if (!withinRateLimit(req)) {
    res.setHeader('Retry-After', '600')
    return res.status(429).json({ error: 'rate_limited', requestId: id })
  }

  const env = globalThis.process?.env || {}
  const config = getAiRuntimeConfig(env)
  if (!config.configured) return res.status(503).json({ error: 'ai_not_configured', requestId: id })

  const body = parseBody(req)
  const prompt = String(body.prompt || '').trim()
  const systemPrompt = String(body.systemPrompt || '').trim()
  const responseSchema = body.responseSchema && typeof body.responseSchema === 'object'
    ? body.responseSchema
    : null

  if (!prompt) return res.status(400).json({ error: 'prompt_required', requestId: id })
  if (prompt.length > 50000 || systemPrompt.length > 12000) {
    return res.status(413).json({ error: 'prompt_too_large', requestId: id })
  }

  const attempts = []
  let result = null
  let lastFailure = null

  if (config.providers.gemini.configured) {
    try {
      result = await callGemini({ env, prompt, systemPrompt, responseSchema, config })
      attempts.push({ provider: 'gemini-direct', status: 'success' })
    } catch (error) {
      lastFailure = error
      attempts.push({
        provider: 'gemini-direct',
        status: 'failed',
        code: error?.code || 'gemini_provider_error',
        httpStatus: error?.status || 502,
        retryable: Boolean(error?.retryable),
      })
    }
  }

  if (!result && config.providers.gateway.configured) {
    try {
      result = await callGateway({ env, prompt, systemPrompt, responseSchema, config })
      attempts.push({ provider: 'vercel-ai-gateway', status: 'success' })
    } catch (error) {
      lastFailure = error
      attempts.push({
        provider: 'vercel-ai-gateway',
        status: 'failed',
        code: error?.code || 'gateway_provider_error',
        httpStatus: error?.status || 502,
        retryable: Boolean(error?.retryable),
      })
    }
  }

  const latencyMs = Date.now() - startedAt

  if (!result) {
    const status = lastFailure?.status === 429 ? 429 : 502
    logEvent('ai.error', {
      requestId: id,
      latencyMs,
      attempts,
      finalCode: lastFailure?.code || 'ai_proxy_failed',
    })
    return res.status(status).json({
      error: lastFailure?.code || 'ai_proxy_failed',
      requestId: id,
      attempts,
    })
  }

  res.setHeader('X-OfferClaw-AI-Provider', result.provider)
  logEvent('ai.success', {
    requestId: id,
    provider: result.provider,
    model: result.model,
    latencyMs,
    fallbackUsed: attempts.some(attempt => attempt.status === 'failed'),
    attempts: attempts.length,
  })

  return res.status(200).json({
    text: result.text,
    structured: result.structured,
    model: result.model,
    interactionId: result.upstreamId,
    runtime: {
      requestId: id,
      provider: result.provider,
      model: result.model,
      latencyMs,
      fallbackUsed: attempts.some(attempt => attempt.status === 'failed'),
      attempts,
      usage: result.usage,
    },
  })
}
