import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildInspectionReview,
  createInspectionTaskForJob,
  inspectionEligibility,
  requestFormInspection,
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
      { label: 'Full name', name: 'name', required: true },
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
