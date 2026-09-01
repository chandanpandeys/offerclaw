import test from 'node:test'
import assert from 'node:assert/strict'

import { validateSubmitApprovalRecord } from '../src/submitProtocol.js'

const NOW = new Date('2026-09-01T12:00:00Z')
const SESSION_ID = 'abcdefghijklmnopqrstuvwxyzABCDEFGH12345678'

function approval(overrides = {}) {
  return {
    version: 1,
    id: 'approval-1234',
    scope: 'submit_once',
    decision: 'explicit_user_approval',
    jobId: 'job-1',
    connectorId: 'lever',
    jobUrl: 'https://jobs.lever.co/example/abc',
    sessionId: SESSION_ID,
    approvedAt: '2026-09-01T11:59:00Z',
    expiresAt: '2026-09-01T12:04:00Z',
    consumed: false,
    ...overrides,
  }
}

test('valid short-lived approval is normalized without candidate data', () => {
  const result = validateSubmitApprovalRecord(approval(), { now: NOW })
  assert.equal(result.ok, true)
  assert.equal(result.approval.connectorId, 'lever')
  assert.equal(result.approval.sessionId, SESSION_ID)
  assert.equal(Object.hasOwn(result.approval, 'profile'), false)
  assert.equal(Object.hasOwn(result.approval, 'resume'), false)
})

test('expired consumed or overlong approvals are rejected', () => {
  assert.equal(validateSubmitApprovalRecord(approval({ expiresAt: '2026-09-01T11:59:59Z' }), { now: NOW }).reason, 'submit_approval_expired')
  assert.equal(validateSubmitApprovalRecord(approval({ consumed: true }), { now: NOW }).reason, 'submit_approval_already_consumed')
  assert.equal(validateSubmitApprovalRecord(approval({ approvedAt: '2026-09-01T11:00:00Z', expiresAt: '2026-09-01T12:01:00Z' }), { now: NOW }).reason, 'submit_approval_ttl_invalid')
})

test('connector and URL must resolve to the same supported ATS', () => {
  const mismatch = validateSubmitApprovalRecord(approval({
    connectorId: 'greenhouse',
    jobUrl: 'https://jobs.lever.co/example/abc',
  }), { now: NOW })
  assert.equal(mismatch.reason, 'submit_approval_connector_url_mismatch')

  const unsupported = validateSubmitApprovalRecord(approval({
    connectorId: 'workday',
    jobUrl: 'https://example.wd5.myworkdayjobs.com/jobs/job/1',
  }), { now: NOW })
  assert.equal(unsupported.reason, 'submit_approval_connector_not_enabled')
})

test('approval cannot be forged far into the future or with invalid session capability', () => {
  assert.equal(validateSubmitApprovalRecord(approval({ approvedAt: '2026-09-01T12:02:00Z' }), { now: NOW }).reason, 'submit_approval_from_future')
  assert.equal(validateSubmitApprovalRecord(approval({ sessionId: 'guessable' }), { now: NOW }).reason, 'submit_approval_session_invalid')
})
