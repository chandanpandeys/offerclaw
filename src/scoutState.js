import { createScoutGoal, nextScoutDueAt } from './scoutGoals.js'

export const SCOUT_STATE_VERSION = 1
export const MAX_SCOUT_GOALS = 12
export const MAX_SCOUT_RUNS = 40

export const SCOUT_RUN_MODE = Object.freeze({
  INTERACTIVE: 'interactive_ranked',
  BACKGROUND: 'background_discovery',
})

function clean(value, max = 240) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function iso(value, fallback = null) {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback
}

function boundedNumber(value, fallback, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.round(number)))
}

function normalizeSourceCounts(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const output = {}
  for (const [key, count] of Object.entries(value).slice(0, 20)) {
    const name = clean(key, 80)
    if (!name) continue
    output[name] = boundedNumber(count, 0, 0, 10_000)
  }
  return output
}

function normalizeResult(result = {}, mode = SCOUT_RUN_MODE.INTERACTIVE) {
  return {
    id: clean(result.id, 180) || null,
    title: clean(result.title, 180),
    company: clean(result.company, 180),
    location: clean(result.location, 160),
    url: clean(result.url, 2_000) || null,
    matchScore: mode === SCOUT_RUN_MODE.BACKGROUND
      ? null
      : boundedNumber(result.matchScore, 0, 0, 100),
    postedHoursAgo: boundedNumber(result.postedHoursAgo, 72, 0, 100_000),
    source: clean(result.source, 80) || 'unknown',
    dataSource: clean(result.dataSource, 80) || 'unknown',
  }
}

export function normalizeScoutRun(run = {}, now = new Date()) {
  const ranAt = iso(run.ranAt, iso(now))
  const mode = Object.values(SCOUT_RUN_MODE).includes(run.mode)
    ? run.mode
    : SCOUT_RUN_MODE.INTERACTIVE
  const results = Array.isArray(run.results)
    ? run.results.slice(0, 12).map(result => normalizeResult(result, mode))
    : []

  return {
    id: clean(run.id, 180) || `run-${ranAt}`,
    version: 1,
    mode,
    personalized: mode === SCOUT_RUN_MODE.INTERACTIVE,
    goalId: clean(run.goalId, 180) || null,
    goalName: clean(run.goalName, 100) || 'Saved scout',
    ranAt,
    resultCount: boundedNumber(run.resultCount, results.length, 0, 10_000),
    liveCount: boundedNumber(run.liveCount, 0, 0, 10_000),
    demoCount: boundedNumber(run.demoCount, 0, 0, 10_000),
    sourceCounts: normalizeSourceCounts(run.sourceCounts),
    results,
  }
}

function newerGoal(left, right) {
  const leftTime = new Date(left.updatedAt || left.createdAt || 0).getTime()
  const rightTime = new Date(right.updatedAt || right.createdAt || 0).getTime()
  return rightTime > leftTime ? right : left
}

function normalizeGoals(input = [], now = new Date()) {
  const byId = new Map()
  for (const raw of Array.isArray(input) ? input.slice(0, MAX_SCOUT_GOALS * 2) : []) {
    const goal = createScoutGoal(raw, raw.updatedAt || raw.createdAt || now)
    const previous = byId.get(goal.id)
    byId.set(goal.id, previous ? newerGoal(previous, goal) : goal)
  }
  return [...byId.values()]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, MAX_SCOUT_GOALS)
}

function normalizeRuns(input = [], now = new Date()) {
  const byId = new Map()
  for (const raw of Array.isArray(input) ? input.slice(0, MAX_SCOUT_RUNS * 2) : []) {
    const run = normalizeScoutRun(raw, now)
    const previous = byId.get(run.id)
    if (!previous || new Date(run.ranAt).getTime() >= new Date(previous.ranAt).getTime()) {
      byId.set(run.id, run)
    }
  }
  return [...byId.values()]
    .sort((a, b) => new Date(b.ranAt).getTime() - new Date(a.ranAt).getTime())
    .slice(0, MAX_SCOUT_RUNS)
}

export function normalizeScoutState(input = {}, now = new Date()) {
  return {
    version: SCOUT_STATE_VERSION,
    updatedAt: iso(now),
    goals: normalizeGoals(input.goals, now),
    runs: normalizeRuns(input.runs, now),
  }
}

export function nextScoutStateDueAt(stateInput = {}) {
  const state = normalizeScoutState(stateInput, stateInput.updatedAt || new Date())
  const dueTimes = state.goals
    .map(goal => nextScoutDueAt(goal))
    .filter(Boolean)
    .map(value => new Date(value).getTime())
    .filter(Number.isFinite)

  if (!dueTimes.length) return null
  return new Date(Math.min(...dueTimes)).toISOString()
}

export function mergeScoutStates(localInput = {}, remoteInput = {}, now = new Date()) {
  const local = normalizeScoutState(localInput, now)
  const remote = normalizeScoutState(remoteInput, now)
  return normalizeScoutState({
    goals: [...local.goals, ...remote.goals],
    runs: [...local.runs, ...remote.runs],
  }, now)
}
