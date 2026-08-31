import test from 'node:test'
import assert from 'node:assert/strict'

import {
  dedupeJobs,
  fetchPublicAtsSource,
  getJobRuntimeConfig,
  normalizePublicAtsPayload,
  parsePublicAtsSources,
  publicJobRuntime,
  rankDirectJobs,
} from '../api/_lib/jobSources.js'

test('compact ATS configuration is normalized and deduplicated', () => {
  const sources = parsePublicAtsSources('greenhouse:openai=OpenAI;lever:leverdemo=Lever;greenhouse:openai=Duplicate')
  assert.deepEqual(sources, [
    { provider: 'greenhouse', site: 'openai', label: 'OpenAI' },
    { provider: 'lever', site: 'leverdemo', label: 'Lever' },
  ])
})

test('JSON ATS configuration supports labels without exposing arbitrary URLs', () => {
  const sources = parsePublicAtsSources(JSON.stringify([
    { provider: 'ashby', site: 'example', label: 'Example Labs' },
    { provider: 'greenhouse', site: '../metadata', label: 'Bad' },
    { provider: 'unknown', site: 'whatever', label: 'Bad' },
  ]))
  assert.deepEqual(sources, [
    { provider: 'ashby', site: 'example', label: 'Example Labs' },
  ])
})

test('public runtime exposes provider readiness but not configured board identifiers', () => {
  const config = getJobRuntimeConfig({
    JSEARCH_API_KEY: 'secret',
    PUBLIC_ATS_SOURCES: 'greenhouse:openai=OpenAI;lever:leverdemo=Lever',
  })
  const publicRuntime = publicJobRuntime(config)

  assert.equal(publicRuntime.configured, true)
  assert.equal(publicRuntime.publicAtsSourceCount, 2)
  assert.deepEqual(publicRuntime.providers, ['jsearch', 'greenhouse', 'lever'])
  assert.equal(JSON.stringify(publicRuntime).includes('openai'), false)
  assert.equal(JSON.stringify(publicRuntime).includes('leverdemo'), false)
})

test('Greenhouse payloads normalize public job fields and strip markup', () => {
  const jobs = normalizePublicAtsPayload(
    { provider: 'greenhouse', site: 'example', label: 'Example Labs' },
    {
      jobs: [{
        id: 123,
        title: 'AI Engineer',
        location: { name: 'Bengaluru, India' },
        absolute_url: 'https://boards.greenhouse.io/example/jobs/123',
        content: '<p>Build <strong>reliable</strong> AI systems.</p>',
      }],
    },
  )

  assert.equal(jobs.length, 1)
  assert.equal(jobs[0].employer_name, 'Example Labs')
  assert.equal(jobs[0].job_title, 'AI Engineer')
  assert.equal(jobs[0].job_description, 'Build reliable AI systems.')
  assert.equal(jobs[0]._offerclaw_provider, 'greenhouse')
})

test('Lever payloads preserve published timestamp and apply URL', () => {
  const createdAt = Date.UTC(2026, 7, 31, 6, 0, 0)
  const jobs = normalizePublicAtsPayload(
    { provider: 'lever', site: 'example', label: 'Example Labs' },
    [{
      id: 'abc',
      text: 'Product Engineer',
      categories: { location: 'Remote', commitment: 'Full-time' },
      workplaceType: 'remote',
      descriptionPlain: 'Build product systems.',
      createdAt,
      applyUrl: 'https://jobs.lever.co/example/abc/apply',
    }],
  )

  assert.equal(jobs[0].job_is_remote, true)
  assert.equal(jobs[0].job_posted_at_datetime_utc, new Date(createdAt).toISOString())
  assert.equal(jobs[0].job_apply_link, 'https://jobs.lever.co/example/abc/apply')
})

test('Ashby public feeds exclude unlisted jobs', () => {
  const jobs = normalizePublicAtsPayload(
    { provider: 'ashby', site: 'example', label: 'Example Labs' },
    {
      jobs: [
        { title: 'Listed Role', location: 'Remote', isListed: true, applyUrl: 'https://jobs.ashbyhq.com/example/1/application' },
        { title: 'Hidden Role', location: 'Remote', isListed: false, applyUrl: 'https://jobs.ashbyhq.com/example/2/application' },
      ],
    },
  )

  assert.deepEqual(jobs.map(job => job.job_title), ['Listed Role'])
})

test('direct source ranking favors title matches and removes irrelevant jobs', () => {
  const ranked = rankDirectJobs([
    { job_title: 'AI Product Engineer', job_description: 'LLM evaluation systems', employer_name: 'A' },
    { job_title: 'Account Executive', job_description: 'Enterprise sales', employer_name: 'B' },
    { job_title: 'Frontend Engineer', job_description: 'Product UI', employer_name: 'C' },
  ], 'AI Engineer')

  assert.equal(ranked[0].job_title, 'AI Product Engineer')
  assert.equal(ranked.some(job => job.job_title === 'Account Executive'), false)
})

test('dedupe prefers the first occurrence of the same application route', () => {
  const jobs = dedupeJobs([
    { job_id: 'direct', job_apply_link: 'https://example.com/apply', job_title: 'Engineer' },
    { job_id: 'aggregate', job_apply_link: 'https://example.com/apply', job_title: 'Engineer' },
  ])
  assert.deepEqual(jobs.map(job => job.job_id), ['direct'])
})

test('fetch adapter constructs a fixed official Greenhouse API URL', async () => {
  let capturedUrl = null
  const mockFetch = async (url) => {
    capturedUrl = String(url)
    return {
      ok: true,
      json: async () => ({ jobs: [] }),
    }
  }

  await fetchPublicAtsSource(
    { provider: 'greenhouse', site: 'example-board', label: 'Example' },
    mockFetch,
  )

  assert.equal(capturedUrl, 'https://boards-api.greenhouse.io/v1/boards/example-board/jobs?content=true')
})
