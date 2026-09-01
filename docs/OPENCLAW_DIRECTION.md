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
2. **Capability honesty.** The agent knows whether an action is native, a handoff, approval-gated, planned or blocked.
3. **Approval before account-affecting writes.** External submissions/messages do not happen because a language model guessed that they were safe.
4. **No fabricated candidate facts.** Resume and outreach generation remain bounded by profile/resume evidence.
5. **No fabricated people.** Human-finder workflows route to verification rather than generating plausible recruiter identities or emails.
6. **Local-first personal state.** Resume/profile/application evidence stays local unless a narrow sync feature explicitly says otherwise.
7. **Measure outcomes.** Optimize for response/interview/offer conversion, not number of applications sent.
8. **Replaceable connectors.** A platform integration can improve from handoff to native API/browser execution without changing agent policy semantics.
9. **Background discovery is not background application.** A scheduler may find candidates while the browser is closed, but account-affecting actions keep their approval boundary.
10. **One-shot writes stay one-shot.** A final submission is separately approved, connector-scoped, non-replayable, never automatically retried, and followed by bounded outcome capture.

## Current implementation

The repository now contains a working first-generation career-agent control plane:

- `src/connectors.js` — platform/ATS capability registry with native/handoff/approval/planned/blocked semantics
- `src/autonomy.js` — Research/Copilot/Supervised/Autopilot policy engine
- `src/CommandCenter.jsx` — connector inspection, source handoffs and approval queue UI
- `src/AgentContext.jsx` — local profile, pipeline, autonomy, action queue, saved scout goals, run history and bounded submission outcomes
- `src/sourceIntel.js` — apply-route provenance intelligence
- `src/analytics.js` — response/interview/offer funnel analytics
- `src/evals.js` — deterministic application-package guardrails and evidence snapshots
- `api/ai.js` + runtime helpers — resilient AI routing through direct Gemini and optional AI Gateway
- `api/jobs.js` + `api/_lib/jobSources.js` — multi-source JSearch plus public Greenhouse/Lever/Ashby ingestion
- `services/browser-worker/` — isolated Playwright worker for inspection, evidence-bound prefill, retained screenshot review sessions and connector-scoped submit-once execution
- `api/browser/inspect.js` — read-only form-inspection gateway
- `api/browser/prefill.js` + `api/browser/prefill-session.js` — explicit supervised prefill and retained-session cancellation boundary
- `api/browser/submit.js` — short-lived one-time final-submit gateway
- `src/SupervisedPrefillCenter.jsx` + `src/SupervisedPrefillPanel.jsx` — inspect → review → prefill → screenshot → separate submit approval UX
- `src/formPlanner.js` + `src/prefillContract.js` — evidence-bound form planning and safe prefill field contract
- `src/submitReadiness.js` + `src/submitProtocol.js` — deterministic final-submit readiness and approval protocol
- `api/_lib/deviceIdentity.js` + `api/identity/session.js` — signed HttpOnly anonymous device identity boundary
- `api/scout/state.js` + `api/_lib/redisStore.js` — optional device-scoped durable scout state with revision/CAS protection
- `api/cron/scout.js` — bounded daily browser-closed discovery scheduler
- `src/ScoutCenter.jsx` — saved goals, explicit cloud sync, read-only background inbox and local personalized-review handoff
- `experiments/scrapers/scrapling/` — isolated ingestion benchmark with objective promotion criteria

See `docs/CONNECTORS.md`, `docs/BROWSER_WORKER.md`, `docs/SUBMIT_ONCE.md`, `docs/BACKGROUND_SCOUT.md` and the other engineering notes for the individual trust boundaries.

## Current supervised application flow

The first supported live browser connectors are Greenhouse, Lever and Ashby.

```text
live ATS job
   |
inspect only
   |
local evidence/form plan
   |
explicit safe-field approval
   |
frozen + offline prefill
   |
short-lived screenshot review session
   |
deterministic submit readiness gate
   |
fresh explicit submit_once approval
   |
connector-scoped one-click execution
   |
bounded local outcome evidence
```

CAPTCHA, 2FA, login checkpoints, demographic/legal/consent questions, unsupported candidate facts, unresolved required fields and ambiguous submit controls remain outside automatic execution.

LinkedIn and other restricted platform write automation remains blocked unless an authorized integration exists.

## Next major subsystem

The next major phase is **launch hardening and connector breadth**, not broader browser authority.

Priorities:

1. verify the production Vercel web deployment and separately deployed browser-worker connectivity end to end;
2. normalize release/version metadata and publish a real tagged release;
3. finish public README, architecture diagram, screenshots/demo and self-hosting instructions;
4. add production observability around AI, scouting and browser-worker outcome classes without logging candidate content;
5. expand read/search connectors and approved ATS coverage incrementally with the same capability contract;
6. add verified follow-up/outreach integrations through authorized OAuth/API surfaces rather than guessed contact identities;
7. keep final external actions approval-gated until a connector has an explicit, tested policy for greater autonomy.

The product goal remains OpenClaw-like persistence and orchestration, but vertically specialized for career workflows with stronger evidence and approval boundaries around user-facing external actions.
