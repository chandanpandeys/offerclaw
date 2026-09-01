import test from 'node:test'
import assert from 'node:assert/strict'

import { boundedSubmissionOutcome, recordSubmissionInTracker } from '../src/submissionOutcome.js'

const NOW = new Date('2026-09-02T00:00:00Z')
const JOB = {
  id: 'job-1',
  title: 'AI Engineer',
  company: 'Example Labs',
  url: 'https://jobs.lever.co/example/123',
  dataSource: 'lever',
}

function rawOutcome(overrides = {}) {
  return {
    status: 'submitted_confirmed',
    attempted: true,
    confirmed: true,
    connectorId: 'lever',
    approvalId: 'approval-secret-capability',
    sessionId: 'session-secret-capability',
    finalUrl: 'https://jobs.lever.co/example/123/success',
    confirmationSignal: 'thank_you',
    blockers: [],
    network: {
      postRequestCount: 1,
      navigationRequestCount: 1,
      blockedRequestCount: 3,
      lastPostStatus: 200,
    },
    sessionClosed: true,
    completedAt: NOW.toISOString(),
    preview: { base64: 'candidate-screenshot-data' },
    candidateValue: 'asha@example.com',
    ...overrides,
  }
}

test('bounded outcome strips approval/session capabilities and candidate artifacts', () => {
  const evidence = boundedSubmissionOutcome(rawOutcome(), NOW)
  const serialized = JSON.stringify(evidence)

  assert.equal(evidence.status, 'submitted_confirmed')
  assert.equal(evidence.confirmed, true)
  assert.equal(evidence.network.postRequestCount, 1)
  assert.equal(Object.hasOwn(evidence, 'approvalId'), false)
  assert.equal(Object.hasOwn(evidence, 'sessionId'), false)
  assert.equal(serialized.includes('approval-secret-capability'), false)
  assert.equal(serialized.includes('session-secret-capability'), false)
  assert.equal(serialized.includes('candidate-screenshot-data'), false)
  assert.equal(serialized.includes('asha@example.com'), false)
})

test('confirmed submission creates an applied tracker entry', () => {
  const next = recordSubmissionInTracker([], JOB, rawOutcome(), {
    now: NOW,
    idFactory: () => 'tracker-1',
  })

  assert.equal(next.length, 1)
  assert.equal(next[0].id, 'tracker-1')
  assert.equal(next[0].status, 'applied')
  assert.equal(next[0].appliedAt, NOW.toISOString())
  assert.equal(next[0].submissionOutcome.confirmed, true)
})

test('unconfirmed attempted submission is not counted as applied', () => {
  const next = recordSubmissionInTracker([], JOB, rawOutcome({
    status: 'attempted_unconfirmed',
    confirmed: false,
  }), {
    now: NOW,
    idFactory: () => 'tracker-2',
  })

  assert.equal(next[0].status, 'submission_unknown')
  assert.equal(next[0].appliedAt, null)
})

test('existing matching tracker entry is updated instead of duplicated', () => {
  const previous = [{
    id: 'existing',
    jobTitle: JOB.title,
    company: JOB.company,
    url: JOB.url,
    status: 'needs_review',
    statusHistory: [{ status: 'needs_review', at: '2026-09-01T00:00:00Z' }],
  }]

  const next = recordSubmissionInTracker(previous, JOB, rawOutcome(), { now: NOW })
  assert.equal(next.length, 1)
  assert.equal(next[0].id, 'existing')
  assert.equal(next[0].status, 'applied')
  assert.equal(next[0].statusHistory.at(-1).status, 'applied')
})
