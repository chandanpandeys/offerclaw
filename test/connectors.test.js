import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ACTION,
  CAPABILITY,
  CONNECTORS,
  buildPlatformJobSearchUrl,
  capabilityFor,
  connectorSnapshot,
  resolveConnector,
} from '../src/connectors.js'

test('resolves common ATS apply routes without calling them employer-owned', () => {
  assert.equal(resolveConnector({ url: 'https://boards.greenhouse.io/example/jobs/123' }).id, 'greenhouse')
  assert.equal(resolveConnector({ url: 'https://jobs.lever.co/example/abc' }).id, 'lever')
  assert.equal(resolveConnector({ url: 'https://example.wd5.myworkdayjobs.com/en-US/jobs/job/123' }).id, 'workday')
  assert.equal(resolveConnector({ url: 'https://jobs.ashbyhq.com/example/123' }).id, 'ashby')
})

test('resolves job boards separately from ATS and employer sites', () => {
  assert.equal(resolveConnector({ url: 'https://www.linkedin.com/jobs/view/123' }).id, 'linkedin')
  assert.equal(resolveConnector({ url: 'https://in.indeed.com/viewjob?jk=abc' }).id, 'indeed')
  assert.equal(resolveConnector({ url: 'https://www.naukri.com/job-listings-abc' }).id, 'naukri')
  assert.equal(resolveConnector({ url: 'https://apna.co/job/example' }).id, 'apna')
  assert.equal(resolveConnector({ url: 'https://careers.example.com/jobs/123' }).id, 'employer_site')
})

test('hostname substring spoofing never inherits a trusted connector', () => {
  assert.equal(resolveConnector({ url: 'https://greenhouse.io.evil.example/jobs/123' }).id, 'employer_site')
  assert.equal(resolveConnector({ url: 'https://linkedin.com.evil.example/jobs/123' }).id, 'employer_site')
})

test('demo jobs never expose external application actions', () => {
  const demo = resolveConnector({ dataSource: 'demo', url: 'https://example.com' })
  assert.equal(demo.id, 'demo')
  assert.equal(demo.capabilities[ACTION.OPEN_APPLY], CAPABILITY.BLOCKED)
  assert.equal(demo.capabilities[ACTION.SUBMIT_APPLICATION], CAPABILITY.BLOCKED)
})

test('LinkedIn automated submit and message actions are explicitly blocked', () => {
  assert.equal(capabilityFor('linkedin', ACTION.SUBMIT_APPLICATION), CAPABILITY.BLOCKED)
  assert.equal(capabilityFor('linkedin', ACTION.SEND_MESSAGE), CAPABILITY.BLOCKED)
  assert.equal(capabilityFor('linkedin', ACTION.FIND_PEOPLE), CAPABILITY.HANDOFF)
})

test('JSearch is the current native discovery connector', () => {
  assert.equal(CONNECTORS.jsearch.capabilities[ACTION.SEARCH_JOBS], CAPABILITY.NATIVE)
  assert.equal(resolveConnector({ dataSource: 'live' }).id, 'jsearch')
})

test('connector snapshots retain only public capability metadata', () => {
  const snapshot = connectorSnapshot({ url: 'https://jobs.lever.co/example/abc' })
  assert.equal(snapshot.id, 'lever')
  assert.equal(snapshot.kind, 'ats')
  assert.equal(snapshot.capabilities[ACTION.PREPARE_APPLICATION], CAPABILITY.NATIVE)
  assert.equal(Object.hasOwn(snapshot, 'hosts'), false)
})

test('platform search builders encode role and location', () => {
  const profile = { currentRole: 'AI Product Engineer', location: 'Bengaluru, India' }
  const linkedin = buildPlatformJobSearchUrl('linkedin', profile)
  const indeed = buildPlatformJobSearchUrl('indeed', profile)
  const naukri = buildPlatformJobSearchUrl('naukri', profile)

  assert.match(linkedin, /linkedin\.com\/jobs\/search/)
  assert.match(linkedin, /AI%20Product%20Engineer/)
  assert.match(indeed, /indeed\.com\/jobs/)
  assert.match(naukri, /site%3Anaukri\.com/)
})
