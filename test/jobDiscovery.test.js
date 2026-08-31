import test from 'node:test'
import assert from 'node:assert/strict'

import { discoverJobs } from '../api/_lib/jobDiscovery.js'

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

test('JSearch background discovery uses only goal query/location/freshness', async () => {
  let captured = null
  const fetchImpl = async (url, options = {}) => {
    captured = { url: String(url), options }
    return response(200, {
      data: [{
        job_id: 'job-1',
        job_title: 'AI Engineer',
        employer_name: 'Example',
        job_apply_link: 'https://example.com/jobs/1',
      }],
    })
  }

  const result = await discoverJobs({
    env: { JSEARCH_API_KEY: 'server-key' },
    query: 'AI Engineer',
    location: 'Bengaluru, India',
    freshnessHours: 24,
    fetchImpl,
  })

  const url = new URL(captured.url)
  assert.equal(url.hostname, 'jsearch.p.rapidapi.com')
  assert.equal(url.searchParams.get('query'), 'AI Engineer in Bengaluru, India')
  assert.equal(url.searchParams.get('date_posted'), 'today')
  assert.equal(captured.options.headers['x-rapidapi-key'], 'server-key')
  assert.equal(result.data.length, 1)
  assert.deepEqual(result.providers, ['jsearch'])
})

test('72-hour discovery maps to the provider three-day freshness window', async () => {
  let capturedUrl = null
  const fetchImpl = async (url) => {
    capturedUrl = String(url)
    return response(200, { data: [] })
  }

  await discoverJobs({
    env: { JSEARCH_API_KEY: 'server-key' },
    query: 'Product Engineer',
    location: 'Remote',
    freshnessHours: 72,
    fetchImpl,
  })

  assert.equal(new URL(capturedUrl).searchParams.get('date_posted'), '3days')
})

test('public ATS discovery can succeed when another source fails', async () => {
  const fetchImpl = async (url) => {
    const value = String(url)
    if (value.includes('greenhouse')) return response(500, {})
    if (value.includes('lever.co')) {
      return response(200, [{
        id: 'lever-job',
        text: 'AI Product Engineer',
        createdAt: Date.parse('2026-09-01T00:00:00Z'),
        applyUrl: 'https://jobs.lever.co/example/lever-job',
        categories: { location: 'Remote' },
        descriptionPlain: 'AI product engineering role',
      }])
    }
    throw new Error(`unexpected URL ${value}`)
  }

  const result = await discoverJobs({
    env: { PUBLIC_ATS_SOURCES: 'greenhouse:broken=Broken;lever:example=Example' },
    query: 'AI Engineer',
    location: 'Remote',
    fetchImpl,
  })

  assert.equal(result.partial, true)
  assert.deepEqual(result.providers, ['lever'])
  assert.equal(result.data.length, 1)
  assert.equal(result.data[0]._offerclaw_provider, 'lever')
})

test('background discovery fails closed when no job source is configured', async () => {
  await assert.rejects(
    () => discoverJobs({ env: {}, query: 'AI Engineer', location: 'India' }),
    /jobs_not_configured/,
  )
})
