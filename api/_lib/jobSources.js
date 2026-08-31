const MAX_SOURCES = 6
const TOKEN_RE = /^[a-zA-Z0-9_-]{1,100}$/

export const PUBLIC_ATS_PROVIDERS = Object.freeze(['greenhouse', 'lever', 'lever_eu', 'ashby'])

function humanize(value) {
  return String(value || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, match => match.toUpperCase())
    .trim()
}

function cleanText(value, max = 12_000) {
  if (value == null) return ''
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function validSource(source) {
  return Boolean(
    source
    && PUBLIC_ATS_PROVIDERS.includes(source.provider)
    && TOKEN_RE.test(source.site || '')
  )
}

function normalizeSource(source) {
  if (!source || typeof source !== 'object') return null
  const provider = String(source.provider || '').trim().toLowerCase().replace('-', '_')
  const site = String(source.site || source.board || '').trim()
  const label = cleanText(source.label || humanize(site), 120)
  const normalized = { provider, site, label }
  return validSource(normalized) ? normalized : null
}

function parseCompactEntry(entry) {
  const [identity, rawLabel] = String(entry || '').split('=', 2)
  const separator = identity.indexOf(':')
  if (separator < 1) return null
  return normalizeSource({
    provider: identity.slice(0, separator),
    site: identity.slice(separator + 1),
    label: rawLabel,
  })
}

export function parsePublicAtsSources(value) {
  const raw = String(value || '').trim()
  if (!raw) return []

  let candidates = []
  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw)
      candidates = Array.isArray(parsed) ? parsed.map(normalizeSource) : []
    } catch {
      candidates = []
    }
  } else {
    candidates = raw.split(/[;,\n]+/).map(parseCompactEntry)
  }

  const deduped = []
  const seen = new Set()
  for (const source of candidates) {
    if (!source) continue
    const key = `${source.provider}:${source.site}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(source)
    if (deduped.length >= MAX_SOURCES) break
  }
  return deduped
}

export function getJobRuntimeConfig(env = {}) {
  const publicAtsSources = parsePublicAtsSources(env.PUBLIC_ATS_SOURCES)
  return {
    jsearchConfigured: Boolean(env.JSEARCH_API_KEY || env.RAPIDAPI_KEY),
    publicAtsSources,
  }
}

export function publicJobRuntime(config) {
  const providers = []
  if (config.jsearchConfigured) providers.push('jsearch')
  for (const source of config.publicAtsSources) {
    const name = source.provider === 'lever_eu' ? 'lever' : source.provider
    if (!providers.includes(name)) providers.push(name)
  }

  return {
    configured: providers.length > 0,
    providers,
    publicAtsSourceCount: config.publicAtsSources.length,
    directPublicFeeds: config.publicAtsSources.length > 0,
  }
}

function sourceUrl(source) {
  const site = encodeURIComponent(source.site)
  if (source.provider === 'greenhouse') {
    return `https://boards-api.greenhouse.io/v1/boards/${site}/jobs?content=true`
  }
  if (source.provider === 'lever') {
    return `https://api.lever.co/v0/postings/${site}?mode=json`
  }
  if (source.provider === 'lever_eu') {
    return `https://api.eu.lever.co/v0/postings/${site}?mode=json`
  }
  if (source.provider === 'ashby') {
    return `https://api.ashbyhq.com/posting-api/job-board/${site}?includeCompensation=true`
  }
  throw new Error('unsupported_public_ats_provider')
}

function normalizeGreenhouse(source, job) {
  return {
    job_id: `greenhouse:${source.site}:${job.id}`,
    job_title: cleanText(job.title, 240),
    employer_name: source.label,
    job_city: cleanText(job.location?.name, 200) || null,
    job_state: null,
    job_country: null,
    job_is_remote: /remote/i.test(job.location?.name || ''),
    job_posted_at_datetime_utc: null,
    job_apply_link: job.absolute_url || null,
    job_description: cleanText(job.content),
    employer_logo: null,
    job_employment_type: null,
    _offerclaw_provider: 'greenhouse',
  }
}

function normalizeLever(source, job) {
  const created = Number(job.createdAt)
  return {
    job_id: `lever:${source.site}:${job.id}`,
    job_title: cleanText(job.text || job.title, 240),
    employer_name: source.label,
    job_city: cleanText(job.categories?.location || job.location, 200) || null,
    job_state: null,
    job_country: null,
    job_is_remote: /remote/i.test(`${job.workplaceType || ''} ${job.categories?.location || ''}`),
    job_posted_at_datetime_utc: Number.isFinite(created) ? new Date(created).toISOString() : null,
    job_apply_link: job.applyUrl || job.hostedUrl || null,
    job_description: cleanText(job.descriptionPlain || job.description || job.additionalPlain),
    employer_logo: null,
    job_employment_type: cleanText(job.categories?.commitment, 80) || null,
    _offerclaw_provider: 'lever',
  }
}

function ashbyCompensation(job) {
  return cleanText(
    job.compensation?.scrapeableCompensationSalarySummary
    || job.compensation?.compensationTierSummary,
    180,
  ) || null
}

function normalizeAshby(source, job) {
  return {
    job_id: `ashby:${source.site}:${job.id || job.jobUrl || job.applyUrl || job.title}`,
    job_title: cleanText(job.title, 240),
    employer_name: source.label,
    job_city: cleanText(job.location, 200) || null,
    job_state: null,
    job_country: cleanText(job.address?.postalAddress?.addressCountry, 100) || null,
    job_is_remote: /remote/i.test(job.location || ''),
    job_posted_at_datetime_utc: job.publishedAt || null,
    job_apply_link: job.applyUrl || job.jobUrl || null,
    job_description: cleanText(job.descriptionPlain || job.descriptionHtml || job.description),
    employer_logo: null,
    job_employment_type: cleanText(job.employmentType, 80) || null,
    job_salary_text: ashbyCompensation(job),
    _offerclaw_provider: 'ashby',
  }
}

export function normalizePublicAtsPayload(source, payload) {
  if (!validSource(source)) return []

  if (source.provider === 'greenhouse') {
    const jobs = Array.isArray(payload?.jobs) ? payload.jobs : []
    return jobs.map(job => normalizeGreenhouse(source, job)).filter(job => job.job_title)
  }

  if (source.provider === 'lever' || source.provider === 'lever_eu') {
    const jobs = Array.isArray(payload) ? payload : []
    return jobs.map(job => normalizeLever(source, job)).filter(job => job.job_title)
  }

  if (source.provider === 'ashby') {
    const jobs = Array.isArray(payload?.jobs) ? payload.jobs : []
    return jobs
      .filter(job => job?.isListed !== false)
      .map(job => normalizeAshby(source, job))
      .filter(job => job.job_title)
  }

  return []
}

function jobSearchText(job) {
  return `${job.job_title || ''} ${job.job_description || ''} ${job.employer_name || ''}`.toLowerCase()
}

function queryTokens(query) {
  return String(query || '')
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .filter(token => token.length > 1)
}

export function rankDirectJobs(jobs, query) {
  const tokens = queryTokens(query)
  if (!tokens.length) return jobs

  return jobs
    .map(job => {
      const haystack = jobSearchText(job)
      const title = String(job.job_title || '').toLowerCase()
      const hits = tokens.filter(token => haystack.includes(token)).length
      const titleHits = tokens.filter(token => title.includes(token)).length
      return { job, score: titleHits * 3 + hits }
    })
    .filter(row => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(row => row.job)
}

export function dedupeJobs(jobs) {
  const seen = new Set()
  const output = []
  for (const job of jobs) {
    const key = job.job_apply_link
      || job.job_id
      || `${job.employer_name || ''}|${job.job_title || ''}|${job.job_city || ''}`.toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    output.push(job)
  }
  return output
}

export async function fetchPublicAtsSource(source, fetchImpl = fetch) {
  if (!validSource(source)) throw new Error('invalid_public_ats_source')
  const response = await fetchImpl(sourceUrl(source), {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'OfferClaw/1.3 public-job-feed',
    },
    signal: AbortSignal.timeout(12_000),
  })

  if (!response.ok) {
    throw new Error(`public_ats_${source.provider}_${response.status}`)
  }

  const payload = await response.json()
  return normalizePublicAtsPayload(source, payload)
}
