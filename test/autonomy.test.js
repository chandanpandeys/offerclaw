import test from 'node:test'
import assert from 'node:assert/strict'

import { ACTION } from '../src/connectors.js'
import { AUTONOMY_MODE, DECISION, evaluateAction } from '../src/autonomy.js'

test('research mode blocks application handoffs', () => {
  const result = evaluateAction({
    mode: AUTONOMY_MODE.RESEARCH,
    connectorId: 'employer_site',
    action: ACTION.OPEN_APPLY,
  })
  assert.equal(result.decision, DECISION.BLOCK)
})

test('copilot can prepare locally but still treats people search as an external handoff', () => {
  const prepare = evaluateAction({
    mode: AUTONOMY_MODE.COPILOT,
    connectorId: 'greenhouse',
    action: ACTION.PREPARE_APPLICATION,
  })
  const people = evaluateAction({
    mode: AUTONOMY_MODE.COPILOT,
    connectorId: 'linkedin',
    action: ACTION.FIND_PEOPLE,
  })

  assert.equal(prepare.decision, DECISION.ALLOW)
  assert.equal(people.decision, DECISION.REQUIRE_APPROVAL)
})

test('supervised mode queues external apply handoffs for approval', () => {
  const result = evaluateAction({
    mode: AUTONOMY_MODE.SUPERVISED,
    connectorId: 'greenhouse',
    action: ACTION.OPEN_APPLY,
  })
  assert.equal(result.decision, DECISION.REQUIRE_APPROVAL)
})

test('live ATS browser writes require explicit approval even in Autopilot', () => {
  const prefill = evaluateAction({
    mode: AUTONOMY_MODE.AUTOPILOT,
    connectorId: 'greenhouse',
    action: ACTION.PREFILL_APPLICATION,
  })
  const submit = evaluateAction({
    mode: AUTONOMY_MODE.AUTOPILOT,
    connectorId: 'greenhouse',
    action: ACTION.SUBMIT_APPLICATION,
  })

  assert.equal(prefill.decision, DECISION.REQUIRE_APPROVAL)
  assert.equal(submit.decision, DECISION.REQUIRE_APPROVAL)
})

test('LinkedIn automated submit and messaging stay blocked even in Autopilot', () => {
  const submit = evaluateAction({
    mode: AUTONOMY_MODE.AUTOPILOT,
    connectorId: 'linkedin',
    action: ACTION.SUBMIT_APPLICATION,
  })
  const message = evaluateAction({
    mode: AUTONOMY_MODE.AUTOPILOT,
    connectorId: 'linkedin',
    action: ACTION.SEND_MESSAGE,
  })

  assert.equal(submit.decision, DECISION.BLOCK)
  assert.equal(message.decision, DECISION.BLOCK)
})

test('Autopilot may run safe native discovery actions', () => {
  const result = evaluateAction({
    mode: AUTONOMY_MODE.AUTOPILOT,
    connectorId: 'jsearch',
    action: ACTION.SEARCH_JOBS,
  })
  assert.equal(result.decision, DECISION.ALLOW)
})
