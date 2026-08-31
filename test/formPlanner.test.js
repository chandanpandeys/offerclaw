import test from 'node:test'
import assert from 'node:assert/strict'

import {
  FIELD_DECISION,
  FIELD_KIND,
  buildFormPlan,
  classifyField,
  planField,
  safePrefillEntries,
} from '../src/formPlanner.js'

test('classifies CAPTCHA and 2FA checkpoints as manual-only', () => {
  assert.equal(classifyField({ label: 'I am not a robot CAPTCHA' }), FIELD_KIND.CAPTCHA)
  assert.equal(classifyField({ label: 'Enter one-time password (OTP)' }), FIELD_KIND.TWO_FACTOR)

  assert.equal(planField({ label: 'reCAPTCHA' }).decision, FIELD_DECISION.MANUAL)
  assert.equal(planField({ label: 'Verification code' }).decision, FIELD_DECISION.MANUAL)
})

test('demographic and legal declarations are never auto-filled', () => {
  for (const label of [
    'Gender',
    'Race / ethnicity',
    'Veteran status',
    'I certify that this application is accurate',
    'I consent to the privacy policy',
  ]) {
    const plan = planField({ label, required: true }, { profile: { name: 'A Candidate' } })
    assert.equal(plan.decision, FIELD_DECISION.MANUAL, label)
    assert.equal(plan.suggestedValue, null)
  }
})

test('known identity and contact values can be prefilled from direct candidate evidence', () => {
  const context = {
    profile: {
      name: 'Asha Rao',
      email: 'asha@example.com',
      phone: '+91 9000000000',
      location: 'Bengaluru, India',
    },
  }

  const name = planField({ label: 'Full name', required: true }, context)
  const email = planField({ label: 'Email', type: 'email', required: true }, context)
  const city = planField({ label: 'Current location' }, context)

  assert.equal(name.decision, FIELD_DECISION.PREFILL)
  assert.equal(name.suggestedValue, 'Asha Rao')
  assert.equal(name.evidenceSource, 'profile.name')
  assert.equal(email.suggestedValue, 'asha@example.com')
  assert.equal(email.evidenceSource, 'profile.email')
  assert.equal(city.suggestedValue, 'Bengaluru, India')
})

test('missing email and phone remain unresolved instead of being guessed', () => {
  const profile = { name: 'Asha Rao' }
  const email = planField({ label: 'Email address', required: true }, { profile })
  const phone = planField({ label: 'Mobile phone', required: true }, { profile })

  assert.equal(email.decision, FIELD_DECISION.UNRESOLVED)
  assert.equal(email.suggestedValue, null)
  assert.equal(phone.decision, FIELD_DECISION.UNRESOLVED)
  assert.equal(phone.suggestedValue, null)
})

test('salary and work authorization require explicit preferences and final review', () => {
  const missingSalary = planField({ label: 'Expected salary' }, { profile: {} })
  const knownSalary = planField(
    { label: 'Expected salary' },
    { preferences: { salaryExpectation: '₹25L–₹30L' } },
  )
  const auth = planField(
    { label: 'Are you authorized to work in India?' },
    { preferences: { workAuthorization: 'Authorized to work in India' } },
  )

  assert.equal(missingSalary.decision, FIELD_DECISION.UNRESOLVED)
  assert.equal(knownSalary.decision, FIELD_DECISION.REVIEW)
  assert.equal(knownSalary.evidenceSource, 'explicit_preference')
  assert.equal(auth.decision, FIELD_DECISION.REVIEW)
})

test('free-text screening fields are queued for evidence-bound drafting, not autofill', () => {
  const plan = planField(
    { label: 'Why are you interested in this role?', type: 'textarea', required: true },
    { evidenceSnapshotId: 'evidence-123' },
  )

  assert.equal(plan.kind, FIELD_KIND.SCREENING)
  assert.equal(plan.decision, FIELD_DECISION.REVIEW)
  assert.equal(plan.suggestedValue, null)
  assert.equal(plan.evidenceSource, 'evidence-123')
})

test('resume upload requires an explicit asset reference and review', () => {
  const missing = planField({ label: 'Upload resume', type: 'file' }, {})
  const present = planField(
    { label: 'Upload resume', type: 'file' },
    { resumeAssetId: 'resume-version-3' },
  )

  assert.equal(missing.decision, FIELD_DECISION.UNRESOLVED)
  assert.equal(present.decision, FIELD_DECISION.REVIEW)
  assert.equal(present.evidenceSource, 'resume_asset')
})

test('form plans declare page content untrusted and never become submit-ready automatically', () => {
  const plan = buildFormPlan([
    { label: 'Full name', name: 'name', required: true },
    { label: 'Email', name: 'email', type: 'email', required: true },
    { label: 'Gender', name: 'gender' },
  ], {
    profile: { name: 'Asha Rao', email: 'asha@example.com' },
  })

  assert.equal(plan.pageContentTrust, 'untrusted')
  assert.equal(plan.summary.prefill, 2)
  assert.equal(plan.summary.manual, 1)
  assert.equal(plan.summary.canSubmitWithoutReview, false)
})

test('safe prefill output excludes review/manual/unresolved fields', () => {
  const plan = buildFormPlan([
    { label: 'Full name', name: 'full_name' },
    { label: 'Expected salary', name: 'salary' },
    { label: 'Gender', name: 'gender' },
    { label: 'Phone', name: 'phone' },
  ], {
    profile: { name: 'Asha Rao' },
    preferences: { salaryExpectation: '₹25L–₹30L' },
  })

  assert.deepEqual(safePrefillEntries(plan), [
    { key: 'full_name', value: 'Asha Rao', evidenceSource: 'profile.name' },
  ])
})
