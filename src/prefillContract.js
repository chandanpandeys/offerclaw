import { FIELD_DECISION, FIELD_KIND } from './formPlanner.js'

export const PREFILL_PROTOCOL_VERSION = 1
export const MAX_APPROVED_PREFILL_FIELDS = 40
export const MAX_PREFILL_VALUE_LENGTH = 2_000

export const PREFILL_ALLOWED_KINDS = Object.freeze(new Set([
  FIELD_KIND.IDENTITY,
  FIELD_KIND.CONTACT,
  FIELD_KIND.LOCATION,
  FIELD_KIND.PROFILE_LINK,
]))

export const PREFILL_ALLOWED_INPUT_TYPES = Object.freeze(new Set([
  'text',
  'email',
  'tel',
  'url',
  'search',
  'textarea',
  'select',
]))

function clean(value, max = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function directProfileEvidence(value) {
  return /^profile(?:\.|$)/.test(String(value || ''))
}

export function prefillApprovalEntries(plan) {
  if (!Array.isArray(plan?.fields)) return []
  return plan.fields
    .filter(field => field.decision === FIELD_DECISION.PREFILL && field.suggestedValue)
    .slice(0, MAX_APPROVED_PREFILL_FIELDS)
    .map(field => ({
      key: clean(field.key, 180),
      label: clean(field.label, 240),
      inputType: clean(field.inputType, 60).toLowerCase(),
      kind: clean(field.kind, 60),
      value: String(field.suggestedValue).slice(0, MAX_PREFILL_VALUE_LENGTH),
      evidenceSource: clean(field.evidenceSource, 120),
    }))
}

export function validateApprovedPrefillFields(input) {
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, reason: 'approved_prefill_fields_required', fields: [] }
  }
  if (input.length > MAX_APPROVED_PREFILL_FIELDS) {
    return { ok: false, reason: 'too_many_approved_prefill_fields', fields: [] }
  }

  const fields = []
  const seen = new Set()

  for (const raw of input) {
    if (!raw || typeof raw !== 'object') {
      return { ok: false, reason: 'invalid_approved_prefill_field', fields: [] }
    }

    const key = clean(raw.key, 180)
    const label = clean(raw.label, 240)
    const inputType = clean(raw.inputType, 60).toLowerCase()
    const kind = clean(raw.kind, 60)
    const evidenceSource = clean(raw.evidenceSource, 120)
    const rawValue = String(raw.value ?? '')

    if (!key) return { ok: false, reason: 'prefill_field_key_required', fields: [] }
    if (seen.has(key)) return { ok: false, reason: 'duplicate_prefill_field_key', fields: [] }
    if (!PREFILL_ALLOWED_KINDS.has(kind)) return { ok: false, reason: 'prefill_field_kind_not_allowed', fields: [] }
    if (!PREFILL_ALLOWED_INPUT_TYPES.has(inputType)) return { ok: false, reason: 'prefill_input_type_not_allowed', fields: [] }
    if (!directProfileEvidence(evidenceSource)) return { ok: false, reason: 'prefill_direct_profile_evidence_required', fields: [] }
    if (!rawValue.trim()) return { ok: false, reason: 'prefill_value_required', fields: [] }
    if (rawValue.length > MAX_PREFILL_VALUE_LENGTH) return { ok: false, reason: 'prefill_value_too_large', fields: [] }

    seen.add(key)
    fields.push({
      key,
      label,
      inputType,
      kind,
      value: rawValue,
      evidenceSource,
    })
  }

  return { ok: true, reason: 'approved_prefill_fields_valid', fields }
}
