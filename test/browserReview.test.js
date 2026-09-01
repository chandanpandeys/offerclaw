import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildInspectionReview,
  cancelPrefillSession,
  createInspectionTaskForJob,
  createPrefillRequestForReview,
  inspectionEligibility,
  requestFormInspection,
  requestSupervisedPrefill,
} from '../src/browserReview.js'

test('inspection eligibility is destination-derived and limited to live worker connectors', () => {
  assert.equal(inspectionEligibility({ url: 'https://jobs.lever.co/example/123' }).eligible, true)
  assert.equal(inspectionEligibility({ url: 'https://greenhouse.io.evil.example/jobs/123' }).eligible, false)
  assert.equal(inspectionEligibility({ url: 'https://www.linkedin.com/jobs/view/123' }).eligible, false)
})

test('inspection task is always inspect-only even when feed metadata claims another connector', () => {
  const { task, eligibility } = createInspectionTaskForJob({
    id: 'job-123',
    connectorId: 'linkedin',
    url: 'https://job-boards.greenhouse.io/example/jobs/123',
  })

  assert.equal(eligibility.connectorId, 'greenhouse')
  assert.equal(task.connectorId, 'greenhouse')
  assert.equal(task.action, 'inspect_form')
  assert.equal(task.approvalScope, 'inspect_only')
})

test('inspection review turns worker metadata into an evidence-bound form plan', () => {
  const review = buildInspectionReview({
    url: 'https://jobs.lever.co/example/123',
    connectorId: 'lever',
    fields: [
      { label: 'Full name', name: 'name', type: 'text', required: true },
      { label: 'Email', name: 'email', type: 'email', required: true },
      { label: 'Consent choice', name: 'privacy', options: [{ value: 'yes', label: 'I consent to data processing' }] },
    ],
    checkpoints: { captchaDetected: false, twoFactorDetected: false, loginRequired: false },
    metadata: { fieldCount: 3, workerVersion: '0.1.0' },
  }, {
    profile: { name: 'Asha Rao', email: 'asha@example.com' },
    job: { id: 'job-123', url: 'https://jobs.lever.co/example/123' },
  })

  assert.equal(review.plan.summary.prefill, 2)
  assert.equal(review.plan.summary.manual, 1)
  assert.equal(review.plan.summary.canSubmitWithoutReview, false)
  assert.equal(review.metadata.fieldCount, 3)
})

test('prefill request is derived only from reviewed safe direct-profile fields', () => {
  const job = { id: 'job-123', url: 'https://jobs.lever.co/example/123' }
  const review = buildInspectionReview({
    url: job.url,
    connectorId: 'lever',
    fields: [
      { label: 'Full name', name: 'name', type: 'text' },
      { label: 'Email', name: 'email', type: 'email' },
      { label: 'Expected salary', name: 'salary', type: 'text' },
      { label: 'I consent to data processing', name: 'privacy', type: 'select' },
    ],
    checkpoints: {},
  }, {
    profile: { name: 'Asha Rao', email: 'asha@example.com', salaryExpectation: '100' },
    job,
  })

  const request = createPrefillRequestForReview(job, review)
  assert.equal(request.eligible, true)
  assert.equal(request.task.action, 'prefill_application')
  assert.equal(request.task.approvalScope, 'prefill_only')
  assert.deepEqual(request.approvedFields.map(field => field.evidenceSource).sort(), ['profile.email', 'profile.name'])
  assert.equal(request.approvedFields.some(field => field.key === 'salary'), false)
  assert.equal(request.approvedFields.some(field => field.key === 'privacy'), false)
})

test('prefill is unavailable when inspection found a manual checkpoint', () => {
  const job = { id: 'job-123', url: 'https://jobs.ashbyhq.com/example/123' }
  const review = {
    jobId: job.id,
    requestUrl: job.url,
    connectorId: 'ashby',
    checkpoints: { captchaDetected: true, twoFactorDetected: false, loginRequired: false },
    plan: { fields: [{ decision: 'prefill', key: 'email', label: 'Email', inputType: 'email', kind: 'contact', suggestedValue: 'a@example.com', evidenceSource: 'profile.email' }] },
  }
  assert.equal(createPrefillRequestForReview(job, review).reason, 'prefill_manual_checkpoint_required')
})

test('inspection API client preserves server error codes for safe UI messaging', async () => {
  const fetchImpl = async () => ({
    ok: false,
    json: async () => ({ error: 'browser_worker_not_configured' }),
  })

  await assert.rejects(
    requestFormInspection({ version: 1 }, fetchImpl),
    error => error.code === 'browser_worker_not_configured',
  )
})

test('prefill API client requires a retained review session and preview', async () => {
  const sessionId = 'abcdefghijklmnopqrstuvwxyzABCDEFGH12345678'
  const fetchImpl = async (url, options) => {
    assert.equal(url, '/api/browser/prefill')
    assert.equal(options.method, 'POST')
    return {
      ok: true,
      status: 200,
      json: async () => ({
        requestId: 'req-1',
        prefill: {
          session: { id: sessionId, expiresAt: '2026-09-01T12:00:00Z', ttlSeconds: 600 },
          preview: { mimeType: 'image/png', base64: 'iVBORw0KGgo=', width: 1280, height: 900 },
        },
      }),
    }
  }
  const result = await requestSupervisedPrefill({ version: 1 }, [{ key: 'email' }], fetchImpl)
  assert.equal(result.prefill.session.id, sessionId)
})

test('prefill cancellation uses DELETE and treats an already-expired session as safely gone', async () => {
  const sessionId = 'abcdefghijklmnopqrstuvwxyzABCDEFGH12345678'
  const fetchImpl = async (url, options) => {
    assert.equal(url, '/api/browser/prefill-session')
    assert.equal(options.method, 'DELETE')
    assert.deepEqual(JSON.parse(options.body), { sessionId })
    return { ok: false, status: 404, json: async () => ({ error: 'prefill_session_not_found' }) }
  }

  const result = await cancelPrefillSession(sessionId, fetchImpl)
  assert.equal(result.closed, false)
  assert.equal(result.alreadyGone, true)
})
