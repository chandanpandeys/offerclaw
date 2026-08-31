import test from 'node:test'
import assert from 'node:assert/strict'

import {
  APPROVAL_SCOPE,
  BROWSER_ACTION,
  BROWSER_DECISION,
  createBrowserTask,
  validateBrowserTask,
} from '../src/browserTasks.js'

test('allows inspection of a recognized ATS form over HTTPS', () => {
  const task = createBrowserTask({
    connectorId: 'greenhouse',
    action: BROWSER_ACTION.INSPECT_FORM,
    jobUrl: 'https://job-boards.greenhouse.io/example/jobs/123',
    approvalScope: APPROVAL_SCOPE.INSPECT_ONLY,
  })

  const result = validateBrowserTask(task)
  assert.equal(result.decision, BROWSER_DECISION.ALLOW)
  assert.equal(result.connectorId, 'greenhouse')
})

test('LinkedIn browser write tasks remain blocked', () => {
  const task = createBrowserTask({
    connectorId: 'linkedin',
    action: BROWSER_ACTION.SUBMIT_APPLICATION,
    jobUrl: 'https://www.linkedin.com/jobs/view/123',
    approvalScope: APPROVAL_SCOPE.SUBMIT_ONCE,
  })

  assert.equal(validateBrowserTask(task).decision, BROWSER_DECISION.BLOCK)
})

test('generic employer-site labels do not grant arbitrary remote browser access', () => {
  const task = createBrowserTask({
    connectorId: 'employer_site',
    action: BROWSER_ACTION.INSPECT_FORM,
    jobUrl: 'https://careers.example.com/jobs/123',
    approvalScope: APPROVAL_SCOPE.INSPECT_ONLY,
  })

  const result = validateBrowserTask(task)
  assert.equal(result.decision, BROWSER_DECISION.BLOCK)
  assert.equal(result.reason, 'connector_not_browser_write_allowed')
})

test('rejects non-HTTPS browser targets', () => {
  const task = createBrowserTask({
    connectorId: 'lever',
    action: BROWSER_ACTION.INSPECT_FORM,
    jobUrl: 'http://jobs.lever.co/example/123',
    approvalScope: APPROVAL_SCOPE.INSPECT_ONLY,
  })

  assert.deepEqual(validateBrowserTask(task), {
    decision: BROWSER_DECISION.BLOCK,
    reason: 'https_required',
  })
})

test('rejects connector and destination mismatches', () => {
  const task = createBrowserTask({
    connectorId: 'greenhouse',
    action: BROWSER_ACTION.PREFILL_APPLICATION,
    jobUrl: 'https://jobs.lever.co/example/123',
    approvalScope: APPROVAL_SCOPE.PREFILL_ONLY,
  })

  const result = validateBrowserTask(task)
  assert.equal(result.decision, BROWSER_DECISION.BLOCK)
  assert.equal(result.reason, 'connector_destination_mismatch')
  assert.equal(result.resolvedConnectorId, 'lever')
})

test('prefill approval scope cannot authorize final submission', () => {
  const task = createBrowserTask({
    connectorId: 'ashby',
    action: BROWSER_ACTION.SUBMIT_APPLICATION,
    jobUrl: 'https://jobs.ashbyhq.com/example/123/application',
    approvalScope: APPROVAL_SCOPE.PREFILL_ONLY,
  })

  const result = validateBrowserTask(task)
  assert.equal(result.decision, BROWSER_DECISION.BLOCK)
  assert.equal(result.reason, 'approval_scope_too_narrow')
})

test('submit-once scope does not widen the connector allowlist', () => {
  const task = createBrowserTask({
    connectorId: 'unknown',
    action: BROWSER_ACTION.SUBMIT_APPLICATION,
    jobUrl: 'https://unknown.example/jobs/123',
    approvalScope: APPROVAL_SCOPE.SUBMIT_ONCE,
  })

  const result = validateBrowserTask(task)
  assert.equal(result.decision, BROWSER_DECISION.BLOCK)
  assert.equal(result.reason, 'connector_not_browser_write_allowed')
})

test('browser tasks carry references instead of raw candidate evidence', () => {
  const task = createBrowserTask({
    connectorId: 'workday',
    action: BROWSER_ACTION.PREFILL_APPLICATION,
    jobUrl: 'https://example.wd5.myworkdayjobs.com/jobs/job/123',
    jobId: 'job-123',
    evidenceSnapshotId: 'evidence-abc',
    approvalScope: APPROVAL_SCOPE.PREFILL_ONLY,
  })

  assert.equal(task.evidenceSnapshotId, 'evidence-abc')
  assert.equal(Object.hasOwn(task, 'resume'), false)
  assert.equal(Object.hasOwn(task, 'profile'), false)
})
