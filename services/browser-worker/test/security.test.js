import test from 'node:test'
import assert from 'node:assert/strict'

import { validateInspectRequest, validatePrefillRequest, validateSubmitRequest, validateTargetUrl } from '../security.js'

const SESSION_ID = 'abcdefghijklmnopqrstuvwxyzABCDEFGH12345678'

function inspectPayload(overrides = {}) {
  return {
    version: 1,
    requestId: 'req-1',
    task: {
      version: 1,
      connectorId: 'greenhouse',
      action: 'inspect_form',
      jobUrl: 'https://job-boards.greenhouse.io/example/jobs/123',
      approvalScope: 'inspect_only',
      ...overrides.task,
    },
    policy: {
      pageContentTrust: 'untrusted',
      writesAllowed: false,
      navigationScope: 'task_origin_only',
      ...overrides.policy,
    },
  }
}

function prefillPayload(overrides = {}) {
  return {
    version: 1,
    requestId: 'req-prefill',
    task: {
      version: 1,
      connectorId: 'greenhouse',
      action: 'prefill_application',
      jobUrl: 'https://job-boards.greenhouse.io/example/jobs/123',
      approvalScope: 'prefill_only',
      ...overrides.task,
    },
    approvedFields: overrides.approvedFields || [{
      key: 'full_name',
      label: 'Full name',
      inputType: 'text',
      kind: 'identity',
      value: 'Asha Rao',
      evidenceSource: 'profile.name',
    }],
    policy: {
      pageContentTrust: 'untrusted',
      domWritesAllowed: true,
      networkAfterPrefillAllowed: false,
      submitAllowed: false,
      navigationScope: 'task_origin_only',
      ...overrides.policy,
    },
  }
}

function submitPayload(overrides = {}) {
  const now = Date.now()
  const task = {
    version: 1,
    connectorId: 'greenhouse',
    action: 'submit_application',
    jobUrl: 'https://job-boards.greenhouse.io/example/jobs/123',
    jobId: 'job-123',
    approvalScope: 'submit_once',
    ...overrides.task,
  }
  return {
    version: 1,
    requestId: 'req-submit',
    task,
    approval: {
      version: 1,
      id: 'approval-security-test',
      scope: 'submit_once',
      decision: 'explicit_user_approval',
      connectorId: task.connectorId,
      jobId: task.jobId,
      jobUrl: task.jobUrl,
      sessionId: SESSION_ID,
      approvedAt: new Date(now - 1_000).toISOString(),
      expiresAt: new Date(now + 120_000).toISOString(),
      consumed: false,
      ...overrides.approval,
    },
    policy: {
      pageContentTrust: 'untrusted',
      navigationScope: 'task_origin_only',
      submitAllowed: true,
      singleSubmitAttempt: true,
      browserMustStartOffline: true,
      networkPolicy: 'connector_submission_only',
      ...overrides.policy,
    },
  }
}

test('allows exact and subdomain targets for enabled ATS connectors', () => {
  assert.equal(validateTargetUrl('https://job-boards.greenhouse.io/example/jobs/123', 'greenhouse').ok, true)
  assert.equal(validateTargetUrl('https://jobs.lever.co/example/123', 'lever').ok, true)
  assert.equal(validateTargetUrl('https://jobs.ashbyhq.com/example/123', 'ashby').ok, true)
})

test('rejects hostname substring spoofing', () => {
  const result = validateTargetUrl('https://greenhouse.io.evil.example/jobs/123', 'greenhouse')
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'target_host_not_allowed')
})

test('rejects URL credentials', () => {
  const result = validateTargetUrl('https://user:pass@jobs.lever.co/example/123', 'lever')
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'url_credentials_not_allowed')
})

test('rejects connectors not enabled in the first worker', () => {
  const result = validateTargetUrl('https://example.wd5.myworkdayjobs.com/jobs/123', 'workday')
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'connector_not_enabled')
})

test('inspection rejects any request that widens write permission', () => {
  const result = validateInspectRequest(inspectPayload({ policy: { writesAllowed: true } }))
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'writes_must_be_disabled')
})

test('inspection rejects prefill and submit actions', () => {
  const prefill = validateInspectRequest(inspectPayload({ task: { action: 'prefill_application' } }))
  const submit = validateInspectRequest(inspectPayload({ task: { action: 'submit_application', approvalScope: 'submit_once' } }))
  assert.equal(prefill.ok, false)
  assert.equal(prefill.reason, 'inspection_only')
  assert.equal(submit.ok, false)
  assert.equal(submit.reason, 'inspection_only')
})

test('valid inspection returns a normalized trusted target envelope', () => {
  const result = validateInspectRequest(inspectPayload())
  assert.equal(result.ok, true)
  assert.equal(result.connectorId, 'greenhouse')
  assert.equal(result.target.origin, 'https://job-boards.greenhouse.io')
  assert.equal(result.task.approvalScope, 'inspect_only')
})

test('valid prefill requires frozen network and submit disabled', () => {
  const result = validatePrefillRequest(prefillPayload())
  assert.equal(result.ok, true)
  assert.equal(result.connectorId, 'greenhouse')
  assert.equal(result.task.approvalScope, 'prefill_only')
  assert.equal(result.approvedFields[0].evidenceSource, 'profile.name')

  assert.equal(
    validatePrefillRequest(prefillPayload({ policy: { networkAfterPrefillAllowed: true } })).reason,
    'prefill_network_must_be_frozen',
  )
  assert.equal(
    validatePrefillRequest(prefillPayload({ policy: { submitAllowed: true } })).reason,
    'submit_must_be_disabled',
  )
})

test('worker prefill rejects submit action and wider approval scope', () => {
  const submit = validatePrefillRequest(prefillPayload({
    task: { action: 'submit_application', approvalScope: 'submit_once' },
  }))
  assert.equal(submit.ok, false)
  assert.equal(submit.reason, 'prefill_only')
})

test('worker prefill rejects sensitive kinds and non-profile evidence', () => {
  const sensitive = validatePrefillRequest(prefillPayload({
    approvedFields: [{
      key: 'gender',
      label: 'Gender',
      inputType: 'select',
      kind: 'demographic',
      value: 'Female',
      evidenceSource: 'profile.gender',
    }],
  }))
  assert.equal(sensitive.ok, false)
  assert.equal(sensitive.reason, 'prefill_field_kind_not_allowed')

  const preference = validatePrefillRequest(prefillPayload({
    approvedFields: [{
      key: 'name',
      label: 'Full name',
      inputType: 'text',
      kind: 'identity',
      value: 'Asha Rao',
      evidenceSource: 'explicit_preference',
    }],
  }))
  assert.equal(preference.ok, false)
  assert.equal(preference.reason, 'prefill_direct_profile_evidence_required')
})

test('submit endpoint independently requires submit_once approval and connector-only network policy', () => {
  const result = validateSubmitRequest(submitPayload())
  assert.equal(result.ok, true)
  assert.equal(result.connectorId, 'greenhouse')
  assert.equal(result.approval.sessionId, SESSION_ID)
  assert.equal(result.policy.singleSubmitAttempt, true)

  assert.equal(validateSubmitRequest(submitPayload({ policy: { submitAllowed: false } })).reason, 'submit_permission_required')
  assert.equal(validateSubmitRequest(submitPayload({ policy: { networkPolicy: 'unrestricted' } })).reason, 'connector_submit_network_policy_required')
  assert.equal(validateSubmitRequest(submitPayload({ task: { approvalScope: 'prefill_only' } })).reason, 'submit_once_scope_required')
})

test('submit approval must remain bound to exact connector job and URL', () => {
  assert.equal(
    validateSubmitRequest(submitPayload({ approval: { jobUrl: 'https://job-boards.greenhouse.io/example/jobs/999' } })).reason,
    'submit_approval_url_mismatch',
  )
  assert.equal(
    validateSubmitRequest(submitPayload({ approval: { jobId: 'other-job' } })).reason,
    'submit_approval_job_mismatch',
  )
  assert.equal(
    validateSubmitRequest(submitPayload({ approval: { connectorId: 'lever' } })).reason,
    'submit_approval_connector_url_mismatch',
  )
})
