import test from 'node:test'
import assert from 'node:assert/strict'

import { FIELD_DECISION, FIELD_KIND } from '../src/formPlanner.js'
import {
  MAX_APPROVED_PREFILL_FIELDS,
  prefillApprovalEntries,
  validateApprovedPrefillFields,
} from '../src/prefillContract.js'

test('approval entries include only direct PREFILL fields from the reviewed form plan', () => {
  const entries = prefillApprovalEntries({
    fields: [
      {
        key: 'full_name',
        label: 'Full name',
        inputType: 'text',
        kind: FIELD_KIND.IDENTITY,
        decision: FIELD_DECISION.PREFILL,
        suggestedValue: 'Asha Rao',
        evidenceSource: 'profile.name',
      },
      {
        key: 'salary',
        label: 'Expected salary',
        inputType: 'text',
        kind: FIELD_KIND.SALARY,
        decision: FIELD_DECISION.REVIEW,
        suggestedValue: '25 LPA',
        evidenceSource: 'explicit_preference',
      },
      {
        key: 'gender',
        label: 'Gender',
        inputType: 'select',
        kind: FIELD_KIND.DEMOGRAPHIC,
        decision: FIELD_DECISION.MANUAL,
        suggestedValue: null,
        evidenceSource: null,
      },
    ],
  })

  assert.deepEqual(entries, [{
    key: 'full_name',
    label: 'Full name',
    inputType: 'text',
    kind: FIELD_KIND.IDENTITY,
    value: 'Asha Rao',
    evidenceSource: 'profile.name',
  }])
  assert.equal(validateApprovedPrefillFields(entries).ok, true)
})

test('approved fields reject salary, work authorization and manual/sensitive kinds', () => {
  for (const kind of [
    FIELD_KIND.SALARY,
    FIELD_KIND.WORK_AUTHORIZATION,
    FIELD_KIND.DEMOGRAPHIC,
    FIELD_KIND.LEGAL,
    FIELD_KIND.CONSENT,
    FIELD_KIND.CAPTCHA,
    FIELD_KIND.TWO_FACTOR,
    FIELD_KIND.SCREENING,
  ]) {
    const result = validateApprovedPrefillFields([{
      key: `field-${kind}`,
      label: kind,
      inputType: 'text',
      kind,
      value: 'value',
      evidenceSource: 'profile.name',
    }])
    assert.equal(result.ok, false, kind)
    assert.equal(result.reason, 'prefill_field_kind_not_allowed', kind)
  }
})

test('approved fields require direct profile evidence and safe input types', () => {
  const salaryEvidence = validateApprovedPrefillFields([{
    key: 'name',
    label: 'Name',
    inputType: 'text',
    kind: FIELD_KIND.IDENTITY,
    value: 'Asha Rao',
    evidenceSource: 'explicit_preference',
  }])
  assert.equal(salaryEvidence.reason, 'prefill_direct_profile_evidence_required')

  const checkbox = validateApprovedPrefillFields([{
    key: 'agree',
    label: 'Agree',
    inputType: 'checkbox',
    kind: FIELD_KIND.IDENTITY,
    value: 'yes',
    evidenceSource: 'profile.name',
  }])
  assert.equal(checkbox.reason, 'prefill_input_type_not_allowed')
})

test('approved fields reject duplicates, empty values and oversized batches', () => {
  const duplicate = {
    key: 'email',
    label: 'Email',
    inputType: 'email',
    kind: FIELD_KIND.CONTACT,
    value: 'asha@example.com',
    evidenceSource: 'profile.email',
  }

  assert.equal(validateApprovedPrefillFields([duplicate, duplicate]).reason, 'duplicate_prefill_field_key')
  assert.equal(validateApprovedPrefillFields([{ ...duplicate, value: '   ' }]).reason, 'prefill_value_required')

  const tooMany = Array.from({ length: MAX_APPROVED_PREFILL_FIELDS + 1 }, (_, index) => ({
    ...duplicate,
    key: `email-${index}`,
  }))
  assert.equal(validateApprovedPrefillFields(tooMany).reason, 'too_many_approved_prefill_fields')
})
