import {
  dedupeJobs,
  fetchPublicAtsSource,
  getJobRuntimeConfig,
  rankDirectJobs,
} from './_lib/jobSources.js'

function parseBody(req) {
  if (!req.body) return {}
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body) } catch { return {} }
  }
  return req.body
}

async function fetchJSearch({ apiKey, query, location, freshness }) {
  const params = new URLSearchParams({
    query: `${query} in ${location}`,
    page: '1',
    num_pages: '1',
    date_posted: freshness,
  })

  const upstream = await fetch(`https://jsearch.p.rapidapi.com/search?${params}`, {
    headers: {
      'x-rapidapi-host': 'jsearch.p.rapidapi.com',
      'x-rapidapi-key': apiKey,
    },
    signal: AbortSignal.timeout(20_000),
  })

  if (!upstream.ok) {
    const details = await upstream.text()
    console.error('JSearch upstream error', upstream.status, details.slice(0, 300))
    throw new Error(upstream.status === 429 ? 'provider_rate_limited' : 'jobs_provider_error')
  }

  const data = await upstream.json()
  return Array.isArray(data.data) ? data.data.slice(0, 16) : []
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const env = globalThis.process?.env || {}
  const runtime = getJobRuntimeConfig(env)
  if (!runtime.jsearchConfigured && runtime.publicAtsSources.length === 0) {
    return res.status(503).json({ error: 'jobs_not_configured' })
  }

  const body = parseBody(req)
  const query = String(body.query || 'software engineer').trim().slice(0, 140)
  const location = String(body.location || 'India').trim().slice(0, 100)
  const freshness = ['today', '3days', 'week', 'month'].includes(body.freshness)
    ? body.freshness
    : '3days'

  const tasks = []
  if (runtime.jsearchConfigured) {
    tasks.push({
      provider: 'jsearch',
      run: () => fetchJSearch({
        apiKey: env.JSEARCH_API_KEY || env.RAPIDAPI_KEY,
        query,
        location,
        freshness,
      }),
    })
  }

  for (const source of runtime.publicAtsSources) {
    tasks.push({
      provider: source.provider === 'lever_eu' ? 'lever' : source.provider,
      run: async () => rankDirectJobs(await fetchPublicAtsSource(source), query).slice(0, 12),
    })
  }

  const settled = await Promise.allSettled(tasks.map(task => task.run()))
  const providers = []
  const directJobs = []
  const aggregateJobs = []
  const failures = []

  settled.forEach((result, index) => {
    const task = tasks[index]
    if (result.status === 'fulfilled') {
      if (!providers.includes(task.provider)) providers.push(task.provider)
      if (task.provider === 'jsearch') aggregateJobs.push(...result.value)
      else directJobs.push(...result.value)
      return
    }

    const code = result.reason instanceof Error ? result.reason.message : 'provider_failed'
    failures.push({ provider: task.provider, code: String(code).slice(0, 120) })
    console.error('Jobs source failed', task.provider, String(code).slice(0, 200))
  })

  const data = dedupeJobs([...directJobs, ...aggregateJobs]).slice(0, 20)
  if (!providers.length) {
    const rateLimited = failures.some(item => item.code === 'provider_rate_limited')
    return res.status(rateLimited ? 429 : 502).json({
      error: rateLimited ? 'provider_rate_limited' : 'jobs_providers_failed',
      providers: failures.map(item => item.provider),
    })
  }

  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600')
  return res.status(200).json({
    data,
    source: providers.length > 1 ? 'multi' : providers[0],
    providers,
    partial: failures.length > 0,
  })
}
