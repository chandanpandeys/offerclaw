import test from 'node:test'
import assert from 'node:assert/strict'

import { createBackgroundDiscoveryRun } from '../src/backgroundScout.js'
import { SCOUT_RUN_MODE } from '../src/scoutState.js'

const NOW = new Date('2026-09-01T00:00:00Z')

test('background discovery stores compact candidates without descriptions or match scores', () => {
  const run = createBackgroundDiscoveryRun({
    id: 'goal-1',
    name: 'AI roles',
    query: 'AI Engineer',
    location: 'India',
    freshnessHours: 72,
    maxResults: 10,
    cadence: 'daily',
    createdAt: '2026-08-31T00:00:00Z',
    updatedAt: '2026-08-31T00:00:00Z',
  }, [{
    job_id: 'job-1',
    job_title: 'AI Engineer',
    employer_name: 'Example',
    job_city: 'Bengaluru',
    job_country: 'India',
    job_posted_at_datetime_utc: '2026-08-31T20:00:00Z',
    job_apply_link: 'https://example.com/jobs/1',
    job_description: 'private-to-runtime full job description',
    _offerclaw_provider: 'jsearch',
  }], NOW)

  assert.equal(run.mode, SCOUT_RUN_MODE.BACKGROUND)
  assert.equal(run.personalized, false)
  assert.equal(run.resultCount, 1)
  assert.equal(run.results[0].title, 'AI Engineer')
  assert.equal(run.results[0].matchScore, null)
  assert.equal(run.results[0].postedHoursAgo, 4)
  assert.equal(Object.hasOwn(run.results[0], 'description'), false)
})

test('background discovery respects freshness and max-result bounds', () => {
  const jobs = [
    {
      job_id: 'fresh-1',
      job_title: 'AI Engineer I',
      employer_name: 'Example',
      job_posted_at_datetime_utc: '2026-08-31T23:00:00Z',
    },
    {
      job_id: 'fresh-2',
      job_title: 'AI Engineer II',
      employer_name: 'Example',
      job_posted_at_datetime_utc: '2026-08-31T22:00:00Z',
    },
    {
      job_id: 'stale',
      job_title: 'Old AI Engineer',
      employer_name: 'Example',
      job_posted_at_datetime_utc: '2026-08-29T00:00:00Z',
    },
  ]

  const run = createBackgroundDiscoveryRun({
    id: 'goal-1',
    query: 'AI Engineer',
    freshnessHours: 24,
    maxResults: 1,
  }, jobs, NOW)

  assert.equal(run.resultCount, 1)
  assert.equal(run.results[0].id, 'fresh-1')
})

test('unknown posting time is conservatively treated as 72 hours old', () => {
  const strict = createBackgroundDiscoveryRun({
    id: 'goal-1',
    query: 'AI Engineer',
    freshnessHours: 24,
  }, [{ job_id: 'unknown', job_title: 'AI Engineer', employer_name: 'Example' }], NOW)
  assert.equal(strict.resultCount, 0)

  const relaxed = createBackgroundDiscoveryRun({
    id: 'goal-2',
    query: 'AI Engineer',
    freshnessHours: 72,
  }, [{ job_id: 'unknown', job_title: 'AI Engineer', employer_name: 'Example' }], NOW)
  assert.equal(relaxed.resultCount, 1)
  assert.equal(relaxed.results[0].postedHoursAgo, 72)
})
