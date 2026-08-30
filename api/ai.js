const WINDOW_MS = 10 * 60 * 1000
const MAX_REQUESTS = 30
const buckets = new Map()

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

function extractText(data) {
  if (typeof data?.output_text === 'string') return data.output_text

  for (const step of data?.steps || []) {
    if (step?.type !== 'model_output') continue
    for (const part of step.content || []) {
      if (part?.type === 'text' && typeof part.text === 'string') return part.text
    }
  }

  return ''
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  if (!withinRateLimit(req)) {
    res.setHeader('Retry-After', '600')
    return res.status(429).json({ error: 'rate_limited' })
  }

  const env = globalThis.process?.env || {}
  const apiKey = env.GEMINI_API_KEY || env.GOOGLE_API_KEY
  if (!apiKey) return res.status(503).json({ error: 'ai_not_configured' })

  const body = parseBody(req)
  const prompt = String(body.prompt || '').trim()
  const systemPrompt = String(body.systemPrompt || '').trim()
  const responseSchema = body.responseSchema && typeof body.responseSchema === 'object'
    ? body.responseSchema
    : null

  if (!prompt) return res.status(400).json({ error: 'prompt_required' })
  if (prompt.length > 50000 || systemPrompt.length > 12000) {
    return res.status(413).json({ error: 'prompt_too_large' })
  }

  const model = env.GEMINI_MODEL || 'gemini-3.7-flash'
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

  try {
    const upstream = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
        'x-goog-api-client': 'offerclaw/1.1.0',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    })

    if (!upstream.ok) {
      const details = await upstream.text()
      console.error('Gemini upstream error', upstream.status, details.slice(0, 500))
      return res.status(upstream.status === 429 ? 429 : 502).json({
        error: upstream.status === 429 ? 'provider_rate_limited' : 'ai_provider_error',
      })
    }

    const data = await upstream.json()
    const text = extractText(data)
    let structured = null

    if (responseSchema && text) {
      try { structured = JSON.parse(text) } catch { structured = null }
    }

    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({
      text,
      structured,
      model,
      interactionId: data.id || null,
    })
  } catch (error) {
    console.error('AI proxy failed', error)
    return res.status(502).json({ error: 'ai_proxy_failed' })
  }
}
