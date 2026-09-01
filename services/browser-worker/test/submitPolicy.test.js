import test from 'node:test'
import assert from 'node:assert/strict'

import {
  connectorSubmitHosts,
  evaluateSubmitNetworkRequest,
  submitHostAllowed,
} from '../submitPolicy.js'

test('submit host allowlist is explicit per supported ATS', () => {
  assert.deepEqual(connectorSubmitHosts('greenhouse'), [
    'boards.greenhouse.io',
    'job-boards.greenhouse.io',
    'boards-api.greenhouse.io',
  ])
  assert.equal(submitHostAllowed('greenhouse', 'https://boards.greenhouse.io/acme/jobs/1'), true)
  assert.equal(submitHostAllowed('greenhouse', 'https://boards-api.greenhouse.io/v1/boards/acme/jobs/1'), true)
  assert.equal(submitHostAllowed('greenhouse', 'https://boards.greenhouse.io.evil.example/apply'), false)
  assert.equal(submitHostAllowed('greenhouse', 'https://app.greenhouse.io/'), false)

  assert.equal(submitHostAllowed('lever', 'https://jobs.lever.co/acme/abc/apply'), true)
  assert.equal(submitHostAllowed('lever', 'https://api.lever.co/v0/postings/acme/abc'), true)
  assert.equal(submitHostAllowed('lever', 'https://jobs.eu.lever.co/acme/abc/apply'), true)
  assert.equal(submitHostAllowed('lever', 'https://lever.co.evil.example/'), false)

  assert.equal(submitHostAllowed('ashby', 'https://jobs.ashbyhq.com/acme/abc/application'), true)
  assert.equal(submitHostAllowed('ashby', 'https://api.ashbyhq.com/applicationForm.submit'), true)
  assert.equal(submitHostAllowed('ashby', 'https://evil.example/ashbyhq.com'), false)
})

test('submit policy allows POST and preflight only to connector-owned hosts', () => {
  const post = evaluateSubmitNetworkRequest({
    connectorId: 'lever',
    url: 'https://api.lever.co/v0/postings/acme/abc',
    method: 'POST',
    resourceType: 'fetch',
  })
  assert.equal(post.allowed, true)
  assert.equal(post.write, true)

  const preflight = evaluateSubmitNetworkRequest({
    connectorId: 'ashby',
    url: 'https://api.ashbyhq.com/applicationForm.submit',
    method: 'OPTIONS',
    resourceType: 'fetch',
  })
  assert.equal(preflight.allowed, true)
  assert.equal(preflight.write, false)

  const foreign = evaluateSubmitNetworkRequest({
    connectorId: 'lever',
    url: 'https://analytics.example/leak',
    method: 'POST',
    resourceType: 'fetch',
  })
  assert.equal(foreign.allowed, false)
})

test('ordinary post-approval GET fetches stay blocked while document navigation is allowed', () => {
  const xhr = evaluateSubmitNetworkRequest({
    connectorId: 'greenhouse',
    url: 'https://boards.greenhouse.io/acme/telemetry?candidate=data',
    method: 'GET',
    resourceType: 'fetch',
    navigationRequest: false,
  })
  assert.equal(xhr.allowed, false)

  const navigation = evaluateSubmitNetworkRequest({
    connectorId: 'greenhouse',
    url: 'https://boards.greenhouse.io/acme/thank-you',
    method: 'GET',
    resourceType: 'document',
    navigationRequest: true,
  })
  assert.equal(navigation.allowed, true)
  assert.equal(navigation.write, false)
})
