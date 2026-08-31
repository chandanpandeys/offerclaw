import { ACTION, CAPABILITY, capabilityFor } from './connectors'

export const AUTONOMY_MODE = Object.freeze({
  RESEARCH: 'research',
  COPILOT: 'copilot',
  SUPERVISED: 'supervised',
  AUTOPILOT: 'autopilot',
})

export const AUTONOMY_MODES = Object.freeze([
  {
    id: AUTONOMY_MODE.RESEARCH,
    label: 'Research',
    description: 'Search, read, rank and verify. No external application actions.',
  },
  {
    id: AUTONOMY_MODE.COPILOT,
    label: 'Copilot',
    description: 'Research plus application and outreach drafting. External actions stay with you.',
  },
  {
    id: AUTONOMY_MODE.SUPERVISED,
    label: 'Supervised Agent',
    description: 'Queue external handoffs and browser-worker actions for explicit approval.',
  },
  {
    id: AUTONOMY_MODE.AUTOPILOT,
    label: 'Autopilot',
    description: 'Run safe native actions automatically; sensitive external actions still require approval.',
  },
])

export const ACTION_LABELS = Object.freeze({
  [ACTION.SEARCH_JOBS]: 'Search jobs',
  [ACTION.READ_JOB]: 'Read job',
  [ACTION.VERIFY_LISTING]: 'Verify listing',
  [ACTION.PREPARE_APPLICATION]: 'Prepare application',
  [ACTION.OPEN_APPLY]: 'Open application',
  [ACTION.PREFILL_APPLICATION]: 'Prefill application',
  [ACTION.SUBMIT_APPLICATION]: 'Submit application',
  [ACTION.FIND_PEOPLE]: 'Find hiring people',
  [ACTION.DRAFT_OUTREACH]: 'Draft outreach',
  [ACTION.SEND_MESSAGE]: 'Send message',
})

const MODE_ACTIONS = Object.freeze({
  [AUTONOMY_MODE.RESEARCH]: new Set([
    ACTION.SEARCH_JOBS,
    ACTION.READ_JOB,
    ACTION.VERIFY_LISTING,
  ]),
  [AUTONOMY_MODE.COPILOT]: new Set([
    ACTION.SEARCH_JOBS,
    ACTION.READ_JOB,
    ACTION.VERIFY_LISTING,
    ACTION.PREPARE_APPLICATION,
    ACTION.FIND_PEOPLE,
    ACTION.DRAFT_OUTREACH,
  ]),
  [AUTONOMY_MODE.SUPERVISED]: new Set(Object.values(ACTION)),
  [AUTONOMY_MODE.AUTOPILOT]: new Set(Object.values(ACTION)),
})

const ALWAYS_APPROVAL = new Set([
  ACTION.SUBMIT_APPLICATION,
  ACTION.SEND_MESSAGE,
])

export const DECISION = Object.freeze({
  ALLOW: 'allow',
  REQUIRE_APPROVAL: 'require_approval',
  PLANNED: 'planned',
  BLOCK: 'block',
})

export function evaluateAction({ mode = AUTONOMY_MODE.SUPERVISED, connectorId, action }) {
  const allowedByMode = MODE_ACTIONS[mode] || MODE_ACTIONS[AUTONOMY_MODE.SUPERVISED]
  const capability = capabilityFor(connectorId, action)

  if (!allowedByMode.has(action)) {
    return {
      decision: DECISION.BLOCK,
      capability,
      reason: `${ACTION_LABELS[action] || action} is outside ${mode} mode.`,
    }
  }

  if (capability === CAPABILITY.BLOCKED) {
    return {
      decision: DECISION.BLOCK,
      capability,
      reason: `${ACTION_LABELS[action] || action} is intentionally blocked for this connector.`,
    }
  }

  if (capability === CAPABILITY.PLANNED) {
    return {
      decision: DECISION.PLANNED,
      capability,
      reason: `${ACTION_LABELS[action] || action} needs a future approved connector or browser worker.`,
    }
  }

  if (ALWAYS_APPROVAL.has(action)) {
    return {
      decision: DECISION.REQUIRE_APPROVAL,
      capability,
      reason: 'Sensitive external actions always require explicit approval.',
    }
  }

  if (capability === CAPABILITY.APPROVAL || capability === CAPABILITY.HANDOFF) {
    return {
      decision: DECISION.REQUIRE_APPROVAL,
      capability,
      reason: capability === CAPABILITY.HANDOFF
        ? 'This action hands control to an external platform and requires approval.'
        : 'This connector requires approval for this action.',
    }
  }

  if (capability === CAPABILITY.NATIVE) {
    return {
      decision: DECISION.ALLOW,
      capability,
      reason: mode === AUTONOMY_MODE.AUTOPILOT
        ? 'Safe native action may run automatically in Autopilot.'
        : 'Native OfferClaw action is allowed in this mode.',
    }
  }

  return {
    decision: DECISION.BLOCK,
    capability,
    reason: 'No supported execution policy exists for this action.',
  }
}

export function canQueueAction(input) {
  const result = evaluateAction(input)
  return result.decision === DECISION.ALLOW || result.decision === DECISION.REQUIRE_APPROVAL
}

export function modeLabel(mode) {
  return AUTONOMY_MODES.find(item => item.id === mode)?.label || 'Supervised Agent'
}
