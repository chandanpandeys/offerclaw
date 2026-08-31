import test from 'node:test'
import assert from 'node:assert/strict'

import { FIELD_DECISION, FIELD_KIND, classifyField, planField } from '../src/formPlanner.js'

test('structured option labels participate in safety classification', () => {
  const consent = {
    label: 'Please choose',
    type: 'select',
    options: [
      { value: 'yes', label: 'I consent to data processing' },
      { value: 'no', label: 'I do not consent' },
    ],
  }

  assert.equal(classifyField(consent), FIELD_KIND.CONSENT)
  assert.equal(planField(consent).decision, FIELD_DECISION.MANUAL)
})
