import test from 'node:test'
import assert from 'node:assert/strict'

import { ACTION, CAPABILITY, CONNECTORS } from '../src/connectors.js'

test('official public ATS feeds expose native read-only discovery capability', () => {
  for (const id of ['greenhouse', 'lever', 'ashby']) {
    assert.equal(CONNECTORS[id].capabilities[ACTION.SEARCH_JOBS], CAPABILITY.NATIVE)
    assert.equal(CONNECTORS[id].capabilities[ACTION.READ_JOB], CAPABILITY.NATIVE)
    assert.equal(CONNECTORS[id].capabilities[ACTION.SUBMIT_APPLICATION], CAPABILITY.PLANNED)
  }
})

test('ATS platforms without a public adapter remain non-native', () => {
  for (const id of ['workday', 'smartrecruiters', 'workable', 'jobvite', 'icims', 'bamboohr']) {
    assert.notEqual(CONNECTORS[id].capabilities[ACTION.SEARCH_JOBS], CAPABILITY.NATIVE)
  }
})
