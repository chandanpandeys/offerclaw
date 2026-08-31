const DAY_MS = 86_400_000

export const SCOUT_CADENCE = Object.freeze({
  MANUAL: 'manual',
  DAILY: 'daily',
})

export const SCOUT_FRESHNESS = Object.freeze({
  DAY: 24,
  THREE_DAYS: 72,
})

function clean(value, max = 240) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function makeId(prefix = 'scout') {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function iso(value) {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString()
}

function boundedNumber(value, fallback, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.round(number)))
}

function normalizeExcludedCompanies(value) {
  const items = Array.isArray(value) ? value : String(value || '').split(',')
  return [...new Set(items.map(item => clean(item, 120).toLowerCase()).filter(Boolean))].slice(0, 30)
}

export function createScoutGoal(input = {}, now = new Date()) {
  const cadence = Object.values(SCOUT_CADENCE).includes(input.cadence)
    ? input.cadence
    : SCOUT_CADENCE.MANUAL
  const freshnessHours = input.freshnessHours === SCOUT_FRESHNESS.DAY
    ? SCOUT_FRESHNESS.DAY
    : SCOUT_FRESHNESS.THREE_DAYS
  const createdAt = iso(input.createdAt || now)

  return {
    id: clean(input.id, 180) || makeId(),
    version: 1,
    name: clean(input.name, 100) || clean(input.query, 100) || 'Saved scout',
    query: clean(input.query, 120) || 'software engineer',
    location: clean(input.location, 100) || 'India',
    freshnessHours,
    minMatch: boundedNumber(input.minMatch, 70, 35, 95),
    maxResults: boundedNumber(input.maxResults, 10, 1, 20),
    excludeApplied: input.excludeApplied !== false,
    excludedCompanies: normalizeExcludedCompanies(input.excludedCompanies),
    cadence,
    enabled: input.enabled !== false,
    createdAt,
    updatedAt: iso(input.updatedAt || now),
    lastRunAt: input.lastRunAt ? iso(input.lastRunAt) : null,
  }
}

export function scoutGoalProfile(goal, profile = {}) {
  return {
    ...profile,
    currentRole: clean(goal?.query, 120) || profile.currentRole || 'software engineer',
    location: clean(goal?.location, 100) || profile.location || 'India',
  }
}

function normalizedKey(value) {
  return clean(value, 220).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function jobIdentity(job = {}) {
  return `${normalizedKey(job.company)}::${normalizedKey(job.title)}`
}

function trackerIdentity(item = {}) {
  return `${normalizedKey(item.company)}::${normalizedKey(item.jobTitle)}`
}

function alreadyApplied(job, tracker = []) {
  const url = clean(job.url, 2_000)
  const identity = jobIdentity(job)
  return tracker.some(item => {
    const sameUrl = url && clean(item.url, 2_000) === url
    return Boolean(sameUrl || (identity !== '::' && trackerIdentity(item) === identity))
  })
}

function companyExcluded(job, excludedCompanies) {
  if (!excludedCompanies.length) return false
  const company = normalizedKey(job.company)
  return excludedCompanies.some(excluded => company.includes(normalizedKey(excluded)))
}

export function filterScoutResults(jobs = [], goalInput = {}, tracker = []) {
  const goal = createScoutGoal(goalInput, goalInput.updatedAt || goalInput.createdAt || new Date())
  const input = Array.isArray(jobs) ? jobs : []

  return input
    .filter(job => Number(job.matchScore || 0) >= goal.minMatch)
    .filter(job => Number(job.postedHoursAgo ?? Number.POSITIVE_INFINITY) <= goal.freshnessHours)
    .filter(job => !companyExcluded(job, goal.excludedCompanies))
    .filter(job => !goal.excludeApplied || !alreadyApplied(job, tracker))
    .slice(0, goal.maxResults)
}

export function nextScoutDueAt(goalInput) {
  const goal = createScoutGoal(goalInput, goalInput.updatedAt || goalInput.createdAt || new Date())
  if (!goal.enabled || goal.cadence === SCOUT_CADENCE.MANUAL) return null
  if (!goal.lastRunAt) return goal.createdAt
  return new Date(new Date(goal.lastRunAt).getTime() + DAY_MS).toISOString()
}

export function isScoutDue(goalInput, now = new Date()) {
  const dueAt = nextScoutDueAt(goalInput)
  if (!dueAt) return false
  return new Date(dueAt).getTime() <= new Date(now).getTime()
}

function sourceKey(job = {}) {
  return clean(job.connectorId || job.dataSource || job.source || 'unknown', 80) || 'unknown'
}

export function createScoutRun(goalInput, jobs = [], now = new Date()) {
  const goal = createScoutGoal(goalInput, goalInput.updatedAt || goalInput.createdAt || now)
  const results = Array.isArray(jobs) ? jobs : []
  const sourceCounts = {}

  for (const job of results) {
    const source = sourceKey(job)
    sourceCounts[source] = (sourceCounts[source] || 0) + 1
  }

  return {
    id: makeId('run'),
    version: 1,
    goalId: goal.id,
    goalName: goal.name,
    ranAt: iso(now),
    resultCount: results.length,
    liveCount: results.filter(job => job.dataSource !== 'demo').length,
    demoCount: results.filter(job => job.dataSource === 'demo').length,
    sourceCounts,
    results: results.slice(0, 12).map(job => ({
      id: clean(job.id, 180) || null,
      title: clean(job.title, 180),
      company: clean(job.company, 180),
      location: clean(job.location, 160),
      url: clean(job.url, 2_000) || null,
      matchScore: boundedNumber(job.matchScore, 0, 0, 100),
      postedHoursAgo: boundedNumber(job.postedHoursAgo, 0, 0, 100_000),
      source: sourceKey(job),
      dataSource: clean(job.dataSource, 80) || 'unknown',
    })),
  }
}

export function markScoutGoalRun(goalInput, run) {
  return createScoutGoal({
    ...goalInput,
    lastRunAt: run?.ranAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
}
