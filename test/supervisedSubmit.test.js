import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createSubmitApprovalForReview,
  requestSupervisedSubmit,
  submitReadinessForReview,
} from '../src/supervisedSubmit.js'

const NOW = new Date('2026-09-02T00:00:00Z')
const SESSION_ID = 'abcdefghijklmnopqrstuvwxyzABCDEFGH12345678'
const JOB = { id: 'job-1', url: 'https://jobs.lever.co/example/abc' }
const REVIEW = {
  jobId: JOB.id,
  connectorId: 'lever',
  requestUrl: JOB.url,
  checkpoints: { captchaDetected: false, twoFactorDetected: false, loginRequired: false },
  plan: { fields: [{ key: 'email', label: 'Email', required: true, decision: 'prefill' }] },
}
const PREFILL = {
  url: JOB.url,
  connectorId: 'lever',
  session: { id: SESSION_ID, expiresAt: '2026-09-02T00:10:00Z' },
  fields: [{ key: 'email', status: 'filled' }],
  metadata: { networkFrozen: true, browserOffline: true, submitAttempted: false },
}

test('fresh frozen review can mint a separate short-lived submit approval', () => {
  const readiness = submitReadinessForReview(JOB, REVIEW, PREFILL, NOW)
  assert.equal(readiness.ready, true)

  const result = createSubmitApprovalForReview(JOB, REVIEW, PREFILL, NOW)
  assert.equal(result.approval.scope, 'submit_once')
  assert.equal(result.approval.sessionId, SESSION_ID)
  assert.equal(result.approval.consumed, false)
})

test('manual checkpoint prevents final approval creation', () => {
  const review = { ...REVIEW, checkpoints: { ...REVIEW.checkpoints, captchaDetected: true } }
  assert.throws(
    () => createSubmitApprovalForReview(JOB, review, PREFILL, NOW),
    error => error.code === 'submit_not_ready' && error.readiness.ready === false,
  )
})

test('submit client sends only approval envelope and returns bounded outcome', async () => {
  let seen
  const fetchImpl = async (url, options) => {
    seen = { url, options, body: JSON.parse(options.body) }
    return {
      ok: true,
      json: async () => ({
        requestId: 'req-1',
        outcome: {
          status: 'submitted_confirmed',
          attempted: true,
          confirmed: true,
          connectorId: 'lever',
          sessionClosed: true,
        },
      }),
    }
  }

  const { approval } = createSubmitApprovalForReview(JOB, REVIEW, PREFILL, NOW)
  const response = await requestSupervisedSubmit(approval, fetchImpl)

  assert.equal(seen.url, '/api/browser/submit')
  assert.equal(seen.options.method, 'POST')
  assert.deepEqual(Object.keys(seen.body), ['approval'])
  assert.equal(Object.hasOwn(seen.body, 'prefill'), false)
  assert.equal(Object.hasOwn(seen.body, 'review'), false)
  assert.equal(response.outcome.confirmed, true)
})
