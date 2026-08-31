import {
  dedupeJobs,
  fetchPublicAtsSource,
  getJobRuntimeConfig,
  rankDirectJobs,
} from './jobSources.js'

function clean(value, max) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function freshnessCode(hours) {
  return Number(hours) <= 24 ? 'today' : '3days'
}

async function fetchJSearch({ apiKey, query, location, freshnessHours, fetchImpl }) {
  const params = new URLSearchParams({
    query: `${query} in ${location}`,
    page: '1',
    num_pages: '1',
    date_posted: freshnessCode(freshnessHours),
  })

  const response = await fetchImpl(`https://jsearch.p.rapidapi.com/search?${params}`, {
    headers: {
      'x-rapidapi-host': 'jsearch.p.rapidapi.com',
      'x-rapidapi-key': apiKey,
    },
    signal: AbortSignal.timeout(20_000),
  })

  if (!response.ok) {
    throw new Error(response.status === 429 ? 'provider_rate_limited' : 'jobs_provider_error')
  }

  const payload = await response.json()
  return Array.isArray(payload?.data) ? payload.data.slice(0, 16) : []
}

export async function discoverJobs({
  env = {},
  query,
  location,
  freshnessHours = 72,
  fetchImpl = globalThis.fetch,
}) {
  const runtime = getJobRuntimeConfig(env)
  if (!runtime.jsearchConfigured && runtime.publicAtsSources.length === 0) {
    throw new Error('jobs_not_configured')
  }

  const safeQuery = clean(query || 'software engineer', 140)
  const safeLocation = clean(location || 'India', 100)
  const tasks = []

  if (runtime.jsearchConfigured) {
    tasks.push({
      provider: 'jsearch',
      run: () => fetchJSearch({
        apiKey: env.JSEARCH_API_KEY || env.RAPIDAPI_KEY,
        query: safeQuery,
        location: safeLocation,
        freshnessHours,
        fetchImpl,
      }),
    })
  }

  for (const source of runtime.publicAtsSources) {
    tasks.push({
      provider: source.provider === 'lever_eu' ? 'lever' : source.provider,
      run: async () => rankDirectJobs(await fetchPublicAtsSource(source, fetchImpl), safeQuery).slice(0, 12),
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
    failures.push({ provider: task.provider, code: clean(code, 120) })
  })

  if (!providers.length) {
    const rateLimited = failures.some(item => item.code === 'provider_rate_limited')
    throw new Error(rateLimited ? 'provider_rate_limited' : 'jobs_providers_failed')
  }

  return {
    data: dedupeJobs([...directJobs, ...aggregateJobs]).slice(0, 20),
    providers,
    partial: failures.length > 0,
    failures,
  }
}
