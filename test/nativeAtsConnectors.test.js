import test from 'node:test'
import assert from 'node:assert/strict'

import { ACTION, CAPABILITY, CONNECTORS } from '../src/connectors.js'

test('official public ATS feeds expose native discovery and supervised write capabilities', () => {
  for (const id of ['greenhouse', 'lever', 'ashby']) {
    assert.equal(CONNECTORS[id].capabilities[ACTION.SEARCH_JOBS], CAPABILITY.NATIVE)
    assert.equal(CONNECTORS[id].capabilities[ACTION.READ_JOB], CAPABILITY.NATIVE)
    assert.equal(CONNECTORS[id].capabilities[ACTION.PREFILL_APPLICATION], CAPABILITY.APPROVAL)
    assert.equal(CONNECTORS[id].capabilities[ACTION.SUBMIT_APPLICATION], CAPABILITY.APPROVAL)
  }
})

test('ATS platforms without a tested live adapter remain non-native and non-approved', () => {
  for (const id of ['workday', 'smartrecruiters', 'workable', 'jobvite', 'icims', 'bamboohr']) {
    assert.notEqual(CONNECTORS[id].capabilities[ACTION.SEARCH_JOBS], CAPABILITY.NATIVE)
    assert.notEqual(CONNECTORS[id].capabilities[ACTION.SUBMIT_APPLICATION], CAPABILITY.APPROVAL)
  }
})
