function parseBody(req) {
  if (!req.body) return {}
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body) } catch { return {} }
  }
  return req.body
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const env = globalThis.process?.env || {}
  const apiKey = env.JSEARCH_API_KEY || env.RAPIDAPI_KEY
  if (!apiKey) return res.status(503).json({ error: 'jobs_not_configured' })

  const body = parseBody(req)
  const query = String(body.query || 'software engineer').trim().slice(0, 140)
  const location = String(body.location || 'India').trim().slice(0, 100)
  const freshness = ['today', '3days', 'week', 'month'].includes(body.freshness)
    ? body.freshness
    : '3days'

  const params = new URLSearchParams({
    query: `${query} in ${location}`,
    page: '1',
    num_pages: '1',
    date_posted: freshness,
  })

  try {
    const upstream = await fetch(`https://jsearch.p.rapidapi.com/search?${params}`, {
      headers: {
        'x-rapidapi-host': 'jsearch.p.rapidapi.com',
        'x-rapidapi-key': apiKey,
      },
      signal: AbortSignal.timeout(20000),
    })

    if (!upstream.ok) {
      const details = await upstream.text()
      console.error('JSearch upstream error', upstream.status, details.slice(0, 500))
      return res.status(upstream.status === 429 ? 429 : 502).json({
        error: upstream.status === 429 ? 'provider_rate_limited' : 'jobs_provider_error',
      })
    }

    const data = await upstream.json()
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600')
    return res.status(200).json({
      data: Array.isArray(data.data) ? data.data.slice(0, 12) : [],
      source: 'jsearch',
    })
  } catch (error) {
    console.error('Jobs proxy failed', error)
    return res.status(502).json({ error: 'jobs_proxy_failed' })
  }
}
