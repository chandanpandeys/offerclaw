export const FIELD_KIND = Object.freeze({
  IDENTITY: 'identity',
  CONTACT: 'contact',
  LOCATION: 'location',
  RESUME: 'resume',
  PROFILE_LINK: 'profile_link',
  SCREENING: 'screening',
  SALARY: 'salary',
  WORK_AUTHORIZATION: 'work_authorization',
  DEMOGRAPHIC: 'demographic',
  LEGAL: 'legal',
  CONSENT: 'consent',
  CAPTCHA: 'captcha',
  TWO_FACTOR: 'two_factor',
  UNKNOWN: 'unknown',
})

export const FIELD_DECISION = Object.freeze({
  PREFILL: 'prefill',
  REVIEW: 'review',
  MANUAL: 'manual',
  UNRESOLVED: 'unresolved',
})

const SENSITIVE_PATTERNS = [
  /gender/i,
  /race|ethnic/i,
  /religion/i,
  /disab/i,
  /veteran/i,
  /sexual orientation/i,
  /marital status/i,
  /date of birth|birth date|dob\b/i,
  /national id|aadhaar|aadhar|social security|ssn\b/i,
]

const LEGAL_PATTERNS = [
  /certif(y|ication)|attest/i,
  /under penalty|legally binding/i,
  /terms and conditions|terms of service/i,
  /background check|drug test/i,
  /truthful|accurate information/i,
]

const CONSENT_PATTERNS = [
  /consent/i,
  /privacy policy/i,
  /data processing/i,
  /receive (emails|messages)|marketing/i,
]

const AUTH_PATTERNS = [
  /work authorization|authori[sz]ed to work/i,
  /visa|sponsorship|sponsor/i,
  /citizen(ship)?|right to work/i,
]

const SALARY_PATTERNS = [
  /salary|compensation|expected pay|pay expectation|ctc\b/i,
]

const CAPTCHA_PATTERNS = [/captcha/i, /i am not a robot/i, /recaptcha/i, /hcaptcha/i]
const TWO_FACTOR_PATTERNS = [/two[- ]factor|2fa\b|one[- ]time password|otp\b|verification code/i]

function clean(value, max = 4_000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function optionsText(options) {
  if (!Array.isArray(options)) return ''
  return options.slice(0, 80).map(option => {
    if (option && typeof option === 'object') {
      return [option.label, option.value].filter(Boolean).join(' ')
    }
    return String(option || '')
  }).join(' ')
}

function combinedFieldText(field = {}) {
  return clean([
    field.label,
    field.name,
    field.id,
    field.placeholder,
    field.type,
    field.autocomplete,
    optionsText(field.options),
  ].filter(Boolean).join(' '), 2_000)
}

function matchesAny(value, patterns) {
  return patterns.some(pattern => pattern.test(value))
}

export function classifyField(field = {}) {
  const text = combinedFieldText(field)
  const lowerType = String(field.type || '').toLowerCase()
  const autocomplete = String(field.autocomplete || '').toLowerCase()

  if (matchesAny(text, CAPTCHA_PATTERNS)) return FIELD_KIND.CAPTCHA
  if (matchesAny(text, TWO_FACTOR_PATTERNS)) return FIELD_KIND.TWO_FACTOR
  if (matchesAny(text, SENSITIVE_PATTERNS)) return FIELD_KIND.DEMOGRAPHIC
  if (matchesAny(text, LEGAL_PATTERNS)) return FIELD_KIND.LEGAL
  if (matchesAny(text, CONSENT_PATTERNS)) return FIELD_KIND.CONSENT
  if (matchesAny(text, AUTH_PATTERNS)) return FIELD_KIND.WORK_AUTHORIZATION
  if (matchesAny(text, SALARY_PATTERNS)) return FIELD_KIND.SALARY

  if (/resume|cv\b|curriculum vitae/i.test(text) || lowerType === 'file') return FIELD_KIND.RESUME
  if (/linkedin|github|portfolio|website|personal site/i.test(text) || autocomplete === 'url') return FIELD_KIND.PROFILE_LINK
  if (/email/i.test(text) || lowerType === 'email' || autocomplete === 'email') return FIELD_KIND.CONTACT
  if (/phone|mobile|telephone/i.test(text) || lowerType === 'tel' || autocomplete === 'tel') return FIELD_KIND.CONTACT
  if (/address|city|state|country|location|postal|zip|pincode/i.test(text)) return FIELD_KIND.LOCATION
  if (/first name|last name|full name|your name|candidate name/i.test(text) || autocomplete.includes('name')) return FIELD_KIND.IDENTITY

  if (lowerType === 'textarea' || /why (do|are)|tell us|describe|experience|skills|motivation|cover letter|question/i.test(text)) {
    return FIELD_KIND.SCREENING
  }

  return FIELD_KIND.UNKNOWN
}

function profileValueForField(field, profile = {}) {
  const text = combinedFieldText(field).toLowerCase()

  if (/first name/.test(text)) return clean(profile.firstName || String(profile.name || '').split(/\s+/)[0])
  if (/last name/.test(text)) return clean(profile.lastName || String(profile.name || '').split(/\s+/).slice(1).join(' '))
  if (/full name|your name|candidate name/.test(text)) return clean(profile.name)
  if (/email/.test(text)) return clean(profile.email)
  if (/phone|mobile|telephone/.test(text)) return clean(profile.phone)
  if (/linkedin/.test(text)) return clean(profile.linkedin)
  if (/github/.test(text)) return clean(profile.github)
  if (/portfolio|website|personal site/.test(text)) return clean(profile.portfolio || profile.website)
  if (/city|state|country|location|address|postal|zip|pincode/.test(text)) return clean(profile.location)
  return ''
}

function preferenceValueForField(kind, preferences = {}) {
  if (kind === FIELD_KIND.SALARY) return clean(preferences.salaryExpectation || preferences.salary || '')
  if (kind === FIELD_KIND.WORK_AUTHORIZATION) return clean(preferences.workAuthorization || '')
  return ''
}

function evidenceSource(kind, field, profile, preferences, value) {
  if (!value) return null
  if (kind === FIELD_KIND.SALARY || kind === FIELD_KIND.WORK_AUTHORIZATION) return 'explicit_preference'
  const text = combinedFieldText(field).toLowerCase()
  if (/linkedin/.test(text)) return profile.linkedin ? 'profile.linkedin' : null
  if (/github/.test(text)) return profile.github ? 'profile.github' : null
  if (/portfolio|website|personal site/.test(text)) return (profile.portfolio || profile.website) ? 'profile.portfolio' : null
  if (/email/.test(text)) return profile.email ? 'profile.email' : null
  if (/phone|mobile|telephone/.test(text)) return profile.phone ? 'profile.phone' : null
  if (/name/.test(text)) return profile.name ? 'profile.name' : null
  if (/location|address|city|state|country|postal|zip|pincode/.test(text)) return profile.location ? 'profile.location' : null
  return 'profile'
}

export function planField(field = {}, context = {}) {
  const kind = classifyField(field)
  const profile = context.profile || {}
  const preferences = context.preferences || {}
  const required = Boolean(field.required)

  if ([FIELD_KIND.CAPTCHA, FIELD_KIND.TWO_FACTOR, FIELD_KIND.DEMOGRAPHIC, FIELD_KIND.LEGAL, FIELD_KIND.CONSENT].includes(kind)) {
    return {
      kind,
      decision: FIELD_DECISION.MANUAL,
      suggestedValue: null,
      evidenceSource: null,
      confidence: 1,
      required,
      reason: 'manual_checkpoint',
    }
  }

  if (kind === FIELD_KIND.RESUME) {
    return {
      kind,
      decision: context.resumeAssetId ? FIELD_DECISION.REVIEW : FIELD_DECISION.UNRESOLVED,
      suggestedValue: null,
      evidenceSource: context.resumeAssetId ? 'resume_asset' : null,
      confidence: context.resumeAssetId ? 0.95 : 0,
      required,
      reason: context.resumeAssetId ? 'attachment_requires_review' : 'resume_asset_missing',
    }
  }

  if (kind === FIELD_KIND.SCREENING) {
    return {
      kind,
      decision: FIELD_DECISION.REVIEW,
      suggestedValue: null,
      evidenceSource: context.evidenceSnapshotId || null,
      confidence: 0,
      required,
      reason: 'screening_answer_requires_evidence_bound_draft',
    }
  }

  if (kind === FIELD_KIND.UNKNOWN) {
    return {
      kind,
      decision: FIELD_DECISION.REVIEW,
      suggestedValue: null,
      evidenceSource: null,
      confidence: 0,
      required,
      reason: 'unknown_field_requires_review',
    }
  }

  const preferenceValue = preferenceValueForField(kind, preferences)
  const profileValue = profileValueForField(field, profile)
  const value = preferenceValue || profileValue

  if (!value) {
    return {
      kind,
      decision: FIELD_DECISION.UNRESOLVED,
      suggestedValue: null,
      evidenceSource: null,
      confidence: 0,
      required,
      reason: kind === FIELD_KIND.SALARY || kind === FIELD_KIND.WORK_AUTHORIZATION
        ? 'explicit_preference_required'
        : 'candidate_evidence_missing',
    }
  }

  const source = evidenceSource(kind, field, profile, preferences, value)
  return {
    kind,
    decision: kind === FIELD_KIND.SALARY || kind === FIELD_KIND.WORK_AUTHORIZATION
      ? FIELD_DECISION.REVIEW
      : FIELD_DECISION.PREFILL,
    suggestedValue: value,
    evidenceSource: source,
    confidence: source ? 0.95 : 0.6,
    required,
    reason: kind === FIELD_KIND.SALARY || kind === FIELD_KIND.WORK_AUTHORIZATION
      ? 'explicit_preference_requires_final_review'
      : 'direct_candidate_evidence',
  }
}

export function buildFormPlan(fields = [], context = {}) {
  const input = Array.isArray(fields) ? fields.slice(0, 120) : []
  const plannedFields = input.map((field, index) => ({
    index,
    key: clean(field?.name || field?.id || field?.label || `field-${index}`, 180),
    label: clean(field?.label || field?.name || field?.id || `Field ${index + 1}`, 240),
    inputType: clean(field?.type || 'unknown', 60),
    ...planField(field, context),
  }))

  const counts = plannedFields.reduce((acc, item) => {
    acc[item.decision] = (acc[item.decision] || 0) + 1
    return acc
  }, {})

  return {
    version: 1,
    pageContentTrust: 'untrusted',
    generatedAt: new Date().toISOString(),
    fields: plannedFields,
    summary: {
      total: plannedFields.length,
      prefill: counts[FIELD_DECISION.PREFILL] || 0,
      review: counts[FIELD_DECISION.REVIEW] || 0,
      manual: counts[FIELD_DECISION.MANUAL] || 0,
      unresolved: counts[FIELD_DECISION.UNRESOLVED] || 0,
      canSubmitWithoutReview: false,
    },
  }
}

export function safePrefillEntries(plan) {
  return Array.isArray(plan?.fields)
    ? plan.fields
      .filter(field => field.decision === FIELD_DECISION.PREFILL && field.suggestedValue)
      .map(field => ({ key: field.key, value: field.suggestedValue, evidenceSource: field.evidenceSource }))
    : []
}
