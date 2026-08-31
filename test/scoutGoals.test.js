import test from 'node:test'
import assert from 'node:assert/strict'

import {
  SCOUT_CADENCE,
  createScoutGoal,
  createScoutRun,
  filterScoutResults,
  isScoutDue,
  markScoutGoalRun,
  nextScoutDueAt,
  scoutGoalProfile,
} from '../src/scoutGoals.js'

const now = new Date('2026-08-31T12:00:00.000Z')

test('normalizes saved scout goals into a bounded stable schema', () => {
  const goal = createScoutGoal({
    id: 'goal-1',
    query: '  AI Product Engineer  ',
    location: ' Bengaluru, India ',
    freshnessHours: 24,
    minMatch: 500,
    maxResults: 99,
    cadence: SCOUT_CADENCE.DAILY,
    excludedCompanies: 'Example Corp, Example Corp, OldCo',
  }, now)

  assert.equal(goal.query, 'AI Product Engineer')
  assert.equal(goal.location, 'Bengaluru, India')
  assert.equal(goal.minMatch, 95)
  assert.equal(goal.maxResults, 20)
  assert.deepEqual(goal.excludedCompanies, ['example corp', 'oldco'])
  assert.equal(goal.cadence, SCOUT_CADENCE.DAILY)
})

test('goal profile overrides search target without replacing candidate evidence', () => {
  const profile = scoutGoalProfile({ query: 'Backend Engineer', location: 'Remote' }, {
    name: 'Asha Rao',
    skills: 'Node.js,PostgreSQL',
    currentRole: 'Frontend Engineer',
  })

  assert.equal(profile.currentRole, 'Backend Engineer')
  assert.equal(profile.location, 'Remote')
  assert.equal(profile.skills, 'Node.js,PostgreSQL')
})

test('filters by match, freshness, company exclusions and prior applications', () => {
  const jobs = [
    { id: '1', title: 'AI Engineer', company: 'Fresh Co', matchScore: 90, postedHoursAgo: 4, url: 'https://jobs.example/1' },
    { id: '2', title: 'AI Engineer', company: 'Old Co', matchScore: 92, postedHoursAgo: 80, url: 'https://jobs.example/2' },
    { id: '3', title: 'AI Engineer', company: 'Blocked Labs', matchScore: 95, postedHoursAgo: 2, url: 'https://jobs.example/3' },
    { id: '4', title: 'AI Engineer', company: 'Applied Co', matchScore: 93, postedHoursAgo: 3, url: 'https://jobs.example/4' },
    { id: '5', title: 'AI Engineer', company: 'Low Match', matchScore: 55, postedHoursAgo: 1, url: 'https://jobs.example/5' },
  ]
  const goal = createScoutGoal({
    id: 'goal-1',
    query: 'AI Engineer',
    minMatch: 80,
    freshnessHours: 72,
    excludedCompanies: ['Blocked Labs'],
  }, now)
  const tracker = [{ company: 'Applied Co', jobTitle: 'AI Engineer', url: 'https://jobs.example/4' }]

  assert.deepEqual(filterScoutResults(jobs, goal, tracker).map(job => job.id), ['1'])
})

test('daily scout goals are due immediately until they have a run', () => {
  const goal = createScoutGoal({
    id: 'goal-1',
    query: 'Engineer',
    cadence: SCOUT_CADENCE.DAILY,
  }, now)

  assert.equal(nextScoutDueAt(goal), now.toISOString())
  assert.equal(isScoutDue(goal, now), true)

  const run = createScoutRun(goal, [], now)
  const updated = markScoutGoalRun(goal, run)
  assert.equal(isScoutDue(updated, new Date(now.getTime() + 23 * 60 * 60 * 1000)), false)
  assert.equal(isScoutDue(updated, new Date(now.getTime() + 24 * 60 * 60 * 1000)), true)
})

test('run history stores bounded result evidence rather than full job descriptions', () => {
  const goal = createScoutGoal({ id: 'goal-1', query: 'Engineer' }, now)
  const run = createScoutRun(goal, [{
    id: 'job-1',
    title: 'Engineer',
    company: 'Example',
    location: 'Remote',
    url: 'https://jobs.example/1',
    matchScore: 91,
    postedHoursAgo: 2,
    description: 'This long description must not be copied into run history.',
    dataSource: 'live',
    connectorId: 'greenhouse',
  }], now)

  assert.equal(run.resultCount, 1)
  assert.equal(run.liveCount, 1)
  assert.equal(run.results[0].source, 'greenhouse')
  assert.equal(Object.hasOwn(run.results[0], 'description'), false)
})
