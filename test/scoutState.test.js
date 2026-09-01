import test from 'node:test'
import assert from 'node:assert/strict'

import {
  MAX_SCOUT_GOALS,
  MAX_SCOUT_RUNS,
  SCOUT_RUN_MODE,
  isBackgroundScoutDue,
  mergeScoutStates,
  nextBackgroundScoutDueAt,
  nextScoutStateDueAt,
  normalizeScoutRun,
  normalizeScoutState,
} from '../src/scoutState.js'

const NOW = new Date('2026-09-01T00:00:00Z')

test('durable scout state is bounded and strips unknown data', () => {
  const goals = Array.from({ length: MAX_SCOUT_GOALS + 5 }, (_, index) => ({
    id: `goal-${index}`,
    name: `Goal ${index}`,
    query: 'AI Engineer',
    location: 'India',
    updatedAt: new Date(NOW.getTime() - index * 1000).toISOString(),
    secret: 'drop-me',
  }))
  const runs = Array.from({ length: MAX_SCOUT_RUNS + 5 }, (_, index) => ({
    id: `run-${index}`,
    goalId: 'goal-0',
    goalName: 'Goal 0',
    ranAt: new Date(NOW.getTime() - index * 1000).toISOString(),
    results: [{ title: 'Role', company: 'Company', rawDescription: 'drop-me' }],
    secret: 'drop-me',
  }))

  const state = normalizeScoutState({ goals, runs, secret: 'drop-me' }, NOW)
  assert.equal(state.goals.length, MAX_SCOUT_GOALS)
  assert.equal(state.runs.length, MAX_SCOUT_RUNS)
  assert.equal(Object.hasOwn(state, 'secret'), false)
  assert.equal(Object.hasOwn(state.goals[0], 'secret'), false)
  assert.equal(Object.hasOwn(state.runs[0], 'secret'), false)
  assert.equal(Object.hasOwn(state.runs[0].results[0], 'rawDescription'), false)
})

test('interactive run normalization keeps compact result evidence only', () => {
  const run = normalizeScoutRun({
    id: 'run-1',
    goalId: 'goal-1',
    goalName: 'AI roles',
    ranAt: NOW.toISOString(),
    resultCount: 1,
    sourceCounts: { jsearch: 1 },
    results: [{
      id: 'job-1',
      title: 'AI Engineer',
      company: 'Example',
      location: 'Remote',
      url: 'https://example.com/jobs/1',
      matchScore: 88,
      postedHoursAgo: 4,
      source: 'jsearch',
      dataSource: 'live',
      description: 'must not persist',
    }],
  }, NOW)

  assert.equal(run.mode, SCOUT_RUN_MODE.INTERACTIVE)
  assert.equal(run.personalized, true)
  assert.equal(run.results[0].matchScore, 88)
  assert.equal(run.results[0].title, 'AI Engineer')
  assert.equal(Object.hasOwn(run.results[0], 'description'), false)
})

test('background discovery can never retain a personalized match score', () => {
  const run = normalizeScoutRun({
    id: 'run-bg',
    mode: SCOUT_RUN_MODE.BACKGROUND,
    goalId: 'goal-1',
    goalName: 'AI roles',
    ranAt: NOW.toISOString(),
    results: [{
      title: 'AI Engineer',
      company: 'Example',
      matchScore: 99,
      postedHoursAgo: 3,
      source: 'jsearch',
      dataSource: 'live',
    }],
  }, NOW)

  assert.equal(run.mode, SCOUT_RUN_MODE.BACKGROUND)
  assert.equal(run.personalized, false)
  assert.equal(run.results[0].matchScore, null)
})

test('background daily cadence advances to the next UTC calendar day', () => {
  const lateManualRun = {
    id: 'goal-late',
    query: 'AI Engineer',
    cadence: 'daily',
    enabled: true,
    createdAt: '2026-09-01T08:00:00Z',
    updatedAt: '2026-09-01T20:00:00Z',
    lastRunAt: '2026-09-01T20:00:00Z',
  }

  assert.equal(nextBackgroundScoutDueAt(lateManualRun), '2026-09-02T00:00:00.000Z')
  assert.equal(isBackgroundScoutDue(lateManualRun, new Date('2026-09-01T23:59:59Z')), false)
  assert.equal(isBackgroundScoutDue(lateManualRun, new Date('2026-09-02T03:00:00Z')), true)
})

test('a manual run before the daily cron counts for that UTC day', () => {
  const preCronRun = {
    id: 'goal-pre-cron',
    query: 'AI Engineer',
    cadence: 'daily',
    enabled: true,
    createdAt: '2026-09-01T08:00:00Z',
    updatedAt: '2026-09-02T01:00:00Z',
    lastRunAt: '2026-09-02T01:00:00Z',
  }

  assert.equal(nextBackgroundScoutDueAt(preCronRun), '2026-09-03T00:00:00.000Z')
  assert.equal(isBackgroundScoutDue(preCronRun, new Date('2026-09-02T03:00:00Z')), false)
  assert.equal(isBackgroundScoutDue(preCronRun, new Date('2026-09-03T03:00:00Z')), true)
})

test('state due time uses earliest UTC-day boundary and ignores manual goals', () => {
  const state = {
    goals: [
      {
        id: 'manual',
        query: 'Manual',
        cadence: 'manual',
        createdAt: '2026-08-20T00:00:00Z',
        updatedAt: '2026-08-20T00:00:00Z',
      },
      {
        id: 'daily-later',
        query: 'Later',
        cadence: 'daily',
        createdAt: '2026-08-31T10:00:00Z',
        updatedAt: '2026-08-31T10:00:00Z',
        lastRunAt: '2026-08-31T10:00:00Z',
      },
      {
        id: 'daily-earlier',
        query: 'Earlier',
        cadence: 'daily',
        createdAt: '2026-08-31T02:00:00Z',
        updatedAt: '2026-08-31T02:00:00Z',
        lastRunAt: '2026-08-31T02:00:00Z',
      },
    ],
    runs: [],
  }

  assert.equal(nextScoutStateDueAt(state), '2026-09-01T00:00:00.000Z')
  assert.equal(nextScoutStateDueAt({ goals: [{ id: 'manual', query: 'Only', cadence: 'manual' }] }), null)
})

test('state merge keeps the newer goal version and unions run history', () => {
  const local = {
    goals: [{
      id: 'goal-1',
      name: 'Local newer',
      query: 'AI Engineer',
      location: 'India',
      updatedAt: '2026-09-01T00:00:00Z',
    }],
    runs: [{ id: 'run-local', goalId: 'goal-1', goalName: 'Local newer', ranAt: '2026-08-31T23:00:00Z' }],
  }
  const remote = {
    goals: [{
      id: 'goal-1',
      name: 'Remote older',
      query: 'Software Engineer',
      location: 'India',
      updatedAt: '2026-08-30T00:00:00Z',
    }],
    runs: [{ id: 'run-remote', goalId: 'goal-1', goalName: 'Remote older', ranAt: '2026-08-31T22:00:00Z' }],
  }

  const merged = mergeScoutStates(local, remote, NOW)
  assert.equal(merged.goals.length, 1)
  assert.equal(merged.goals[0].name, 'Local newer')
  assert.deepEqual(merged.runs.map(item => item.id), ['run-local', 'run-remote'])
})
