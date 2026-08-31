# OpenClaw-inspired OfferClaw direction

OfferClaw's north star is a persistent career agent rather than a single job-search page.

The product should let a user state an outcome once — target roles, locations, compensation, constraints, evidence and risk tolerance — and then coordinate discovery, verification, preparation, approvals, follow-up and learning across replaceable connectors.

## Durable layers

```text
Candidate identity + evidence
            |
            v
      Career agent state
            |
   +--------+---------+
   |                  |
Memory / pipeline   Scheduler
   |                  |
   +--------+---------+
            |
       Agent planner
            |
       Policy engine
            |
    Connector registry
            |
   +--------+---------+----------------+
   |        |         |                |
 Search   Verify    Prepare          Act
   |        |         |                |
 APIs     source     AI/evals       approval queue
 feeds    intel      templates      browser/OAuth
```

The architecture should survive model and platform churn. Models, job feeds, browser workers and communication providers are adapters around stable product concepts.

## Product principles

1. **Evidence before action.** Keep the exact job evidence used to rank and draft an application.
2. **Capability honesty.** The agent knows whether an action is native, a handoff, planned or blocked.
3. **Approval before account-affecting writes.** External submissions/messages do not happen because a language model guessed that they were safe.
4. **No fabricated candidate facts.** Resume and outreach generation remain bounded by profile/resume evidence.
5. **No fabricated people.** Human-finder workflows route to verification rather than generating plausible recruiter identities or emails.
6. **Local-first personal state.** Profile, action queue and pipeline remain local until an explicit sync product exists.
7. **Measure outcomes.** Optimize for response/interview/offer conversion, not number of applications sent.
8. **Replaceable connectors.** A platform integration can improve from handoff to native API/browser execution without changing agent policy semantics.

## Current implementation

The repository now contains the first pieces of this control plane:

- `src/connectors.js` — platform/ATS capability registry
- `src/autonomy.js` — Research/Copilot/Supervised/Autopilot policy engine
- `src/CommandCenter.jsx` — connector inspection and approval queue UI
- `src/AgentContext.jsx` — durable autonomy/action-queue state
- `src/sourceIntel.js` — apply-route provenance intelligence
- `src/analytics.js` — funnel conversion analytics
- `src/evals.js` — deterministic application-package guardrails
- `api/ai.js` + `api/aiProviders.js` — resilient AI routing
- `experiments/scrapers/scrapling/` — isolated ingestion benchmark

See `docs/CONNECTORS.md` for connector policy and browser-worker boundaries.

## Next major subsystem

The next large subsystem should be a **browser worker**, not more one-off UI automation.

It should accept a structured, approval-scoped task such as:

```json
{
  "connector": "greenhouse",
  "action": "prefill_application",
  "jobUrl": "https://...",
  "evidenceSnapshotId": "...",
  "approvalScope": "prefill_only"
}
```

and return a structured result containing discovered fields, proposed answers, unresolved questions and screenshots/DOM evidence for review. Final submission remains a separate policy decision.
