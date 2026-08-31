import { createScoutGoal } from './scoutGoals.js'
import { SCOUT_RUN_MODE, normalizeScoutRun } from './scoutState.js'

function clean(value, max = 240) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function postedHoursAgo(job, now) {
  const timestamp = job?.job_posted_at_datetime_utc
    ? new Date(job.job_posted_at_datetime_utc).getTime()
    : NaN
  if (!Number.isFinite(timestamp)) return 72
  return Math.max(0, Math.floor((now.getTime() - timestamp) / 3_600_000))
}

function source(job = {}) {
  return clean(job._offerclaw_provider || 'jsearch', 80) || 'jsearch'
}

function location(job = {}) {
  if (job.job_is_remote) return 'Remote'
  return clean([job.job_city, job.job_state, job.job_country].filter(Boolean).join(', '), 160) || 'Location not specified'
}

function compactJob(job, now) {
  return {
    id: clean(job.job_id, 180) || null,
    title: clean(job.job_title, 180),
    company: clean(job.employer_name, 180),
    location: location(job),
    url: clean(job.job_apply_link || job.job_google_link, 2_000) || null,
    matchScore: null,
    postedHoursAgo: postedHoursAgo(job, now),
    source: source(job),
    dataSource: 'live',
  }
}

export function createBackgroundDiscoveryRun(goalInput, jobs = [], now = new Date()) {
  const goal = createScoutGoal(goalInput, goalInput.updatedAt || goalInput.createdAt || now)
  const compact = (Array.isArray(jobs) ? jobs : [])
    .map(job => compactJob(job, now))
    .filter(job => job.title && job.company)
    .filter(job => job.postedHoursAgo <= goal.freshnessHours)
    .slice(0, goal.maxResults)

  const sourceCounts = {}
  for (const job of compact) sourceCounts[job.source] = (sourceCounts[job.source] || 0) + 1

  return normalizeScoutRun({
    id: `run-bg-${goal.id}-${now.getTime()}`,
    mode: SCOUT_RUN_MODE.BACKGROUND,
    goalId: goal.id,
    goalName: goal.name,
    ranAt: now.toISOString(),
    resultCount: compact.length,
    liveCount: compact.length,
    demoCount: 0,
    sourceCounts,
    results: compact,
  }, now)
}
