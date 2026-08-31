import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSourceIntel, officialCareersSearchUrl } from '../src/sourceIntel.js'

test('recognizes large job boards as routes that need official verification', () => {
  const intel = buildSourceIntel({
    url: 'https://www.linkedin.com/jobs/view/123',
    dataSource: 'live',
  })

  assert.equal(intel.category, 'job_board')
  assert.equal(intel.label, 'LinkedIn')
  assert.equal(intel.needsOfficialVerification, true)
  assert.equal(intel.employerControlled, false)
})

test('recognizes common ATS domains without pretending they are employer-owned', () => {
  const intel = buildSourceIntel({
    url: 'https://boards.greenhouse.io/example/jobs/123',
    dataSource: 'live',
  })

  assert.equal(intel.category, 'ats')
  assert.equal(intel.label, 'Greenhouse')
  assert.equal(intel.needsOfficialVerification, false)
  assert.equal(intel.employerControlled, false)
  assert.ok(intel.score >= 80)
})

test('unknown non-board domains are labeled likely employer routes, not verified employers', () => {
  const intel = buildSourceIntel({
    url: 'https://careers.example.com/jobs/frontend-engineer',
    dataSource: 'live',
  })

  assert.equal(intel.category, 'employer_site')
  assert.equal(intel.host, 'careers.example.com')
  assert.match(intel.warnings[0], /likely|heuristic|verification/i)
})

test('missing and demo apply routes remain explicitly low-confidence', () => {
  assert.equal(buildSourceIntel({ dataSource: 'live' }).category, 'unknown')
  assert.equal(buildSourceIntel({ dataSource: 'demo', url: 'https://example.com' }).category, 'demo')
})

test('official careers search is derived only from job identity fields', () => {
  const url = officialCareersSearchUrl({ company: 'Example Labs', title: 'AI Engineer' })
  assert.match(url, /^https:\/\/www\.google\.com\/search\?q=/)
  assert.match(decodeURIComponent(url), /Example Labs careers AI Engineer/)
})
