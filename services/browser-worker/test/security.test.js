import test from 'node:test'
import assert from 'node:assert/strict'

import { validateInspectRequest, validateTargetUrl } from '../security.js'

function payload(overrides = {}) {
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

test('rejects any request that widens write permission', () => {
  const result = validateInspectRequest(payload({ policy: { writesAllowed: true } }))
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'writes_must_be_disabled')
})

test('rejects prefill and submit actions', () => {
  const prefill = validateInspectRequest(payload({ task: { action: 'prefill_application' } }))
  const submit = validateInspectRequest(payload({ task: { action: 'submit_application', approvalScope: 'submit_once' } }))
  assert.equal(prefill.ok, false)
  assert.equal(prefill.reason, 'inspection_only')
  assert.equal(submit.ok, false)
  assert.equal(submit.reason, 'inspection_only')
})

test('valid request returns a normalized trusted target envelope', () => {
  const result = validateInspectRequest(payload())
  assert.equal(result.ok, true)
  assert.equal(result.connectorId, 'greenhouse')
  assert.equal(result.target.origin, 'https://job-boards.greenhouse.io')
  assert.equal(result.task.approvalScope, 'inspect_only')
})
