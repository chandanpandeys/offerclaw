import test from 'node:test'
import assert from 'node:assert/strict'

import { createSubmitApprovalRecord, evaluateSubmitReadiness } from '../src/submitReadiness.js'

const NOW = new Date('2026-09-01T12:00:00Z')
const SESSION_ID = 'abcdefghijklmnopqrstuvwxyzABCDEFGH12345678'
const JOB = {
  id: 'job-1',
  url: 'https://jobs.lever.co/example/abc',
}

function review(overrides = {}) {
  return {
    jobId: JOB.id,
    connectorId: 'lever',
    requestUrl: JOB.url,
    checkpoints: { captchaDetected: false, twoFactorDetected: false, loginRequired: false },
    plan: {
      fields: [
        { key: 'name', label: 'Full name', required: true, decision: 'prefill' },
        { key: 'email', label: 'Email', required: true, decision: 'prefill' },
        { key: 'portfolio', label: 'Portfolio', required: false, decision: 'unresolved' },
      ],
    },
    ...overrides,
  }
}

function prefill(overrides = {}) {
  return {
    url: JOB.url,
    connectorId: 'lever',
    session: {
      id: SESSION_ID,
      expiresAt: '2026-09-01T12:10:00Z',
      ttlSeconds: 600,
    },
    fields: [
      { key: 'name', status: 'filled' },
      { key: 'email', status: 'filled' },
    ],
    metadata: {
      networkFrozen: true,
      browserOffline: true,
      submitAttempted: false,
    },
    ...overrides,
  }
}

test('clean frozen reviewed form is eligible for a separate submit approval', () => {
  const result = evaluateSubmitReadiness({ job: JOB, review: review(), prefill: prefill(), now: NOW })
  assert.equal(result.ready, true)
  assert.deepEqual(result.blockers, [])
  assert.equal(result.requiredFieldCount, 2)
  assert.equal(result.sessionId, SESSION_ID)
})

test('required review/manual/unresolved fields block submit readiness', () => {
  const result = evaluateSubmitReadiness({
    job: JOB,
    review: review({
      plan: {
        fields: [
          { key: 'name', required: true, decision: 'prefill' },
          { key: 'screening', required: true, decision: 'review' },
          { key: 'consent', required: true, decision: 'manual' },
        ],
      },
    }),
    prefill: prefill({ fields: [{ key: 'name', status: 'filled' }] }),
    now: NOW,
  })

  assert.equal(result.ready, false)
  assert.ok(result.blockers.some(item => item.code === 'submit_required_field_needs_review' && item.detail === 'screening'))
  assert.ok(result.blockers.some(item => item.code === 'submit_required_field_needs_review' && item.detail === 'consent'))
})

test('manual checkpoints block readiness even when safe fields were filled', () => {
  const result = evaluateSubmitReadiness({
    job: JOB,
    review: review({ checkpoints: { captchaDetected: true, twoFactorDetected: false, loginRequired: false } }),
    prefill: prefill(),
    now: NOW,
  })
  assert.equal(result.ready, false)
  assert.ok(result.blockers.some(item => item.code === 'submit_captcha_checkpoint'))
})

test('expired or non-offline sessions cannot authorize submission', () => {
  const result = evaluateSubmitReadiness({
    job: JOB,
    review: review(),
    prefill: prefill({
      session: { id: SESSION_ID, expiresAt: '2026-09-01T11:59:59Z' },
      metadata: { networkFrozen: true, browserOffline: false, submitAttempted: false },
    }),
    now: NOW,
  })

  assert.equal(result.ready, false)
  assert.ok(result.blockers.some(item => item.code === 'submit_prefill_session_expired'))
  assert.ok(result.blockers.some(item => item.code === 'submit_browser_not_offline'))
})

test('rejected prefill or required field missing from live result blocks readiness', () => {
  const result = evaluateSubmitReadiness({
    job: JOB,
    review: review(),
    prefill: prefill({
      fields: [
        { key: 'name', status: 'filled' },
        { key: 'email', status: 'rejected' },
      ],
    }),
    now: NOW,
  })

  assert.equal(result.ready, false)
  assert.ok(result.blockers.some(item => item.code === 'submit_required_prefill_not_filled' && item.detail === 'email'))
  assert.ok(result.blockers.some(item => item.code === 'submit_prefill_rejected' && item.detail === 'email'))
})

test('job/review/prefill destination mismatch is blocked', () => {
  const result = evaluateSubmitReadiness({
    job: JOB,
    review: review({ requestUrl: 'https://jobs.lever.co/example/other' }),
    prefill: prefill({ url: 'https://jobs.lever.co/example/other' }),
    now: NOW,
  })

  assert.equal(result.ready, false)
  assert.ok(result.blockers.some(item => item.code === 'submit_review_url_mismatch'))
  assert.ok(result.blockers.some(item => item.code === 'submit_prefill_url_mismatch'))
})

test('approval record is one-time scoped, short-lived and contains no candidate values', () => {
  const readiness = evaluateSubmitReadiness({ job: JOB, review: review(), prefill: prefill(), now: NOW })
  const record = createSubmitApprovalRecord(readiness, {
    now: NOW,
    idFactory: () => 'approval-1',
  })

  assert.equal(record.scope, 'submit_once')
  assert.equal(record.decision, 'explicit_user_approval')
  assert.equal(record.consumed, false)
  assert.equal(record.sessionId, SESSION_ID)
  assert.equal(record.expiresAt, '2026-09-01T12:05:00.000Z')
  assert.equal(Object.hasOwn(record, 'profile'), false)
  assert.equal(Object.hasOwn(record, 'resume'), false)
  assert.equal(JSON.stringify(record).includes('Asha'), false)
})
