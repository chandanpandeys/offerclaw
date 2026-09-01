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
6. **Local-first personal state.** Resume/profile/application evidence stays local unless a narrow sync feature explicitly says otherwise.
7. **Measure outcomes.** Optimize for response/interview/offer conversion, not number of applications sent.
8. **Replaceable connectors.** A platform integration can improve from handoff to native API/browser execution without changing agent policy semantics.
9. **Background discovery is not background application.** A scheduler may find candidates while the browser is closed, but account-affecting actions keep their approval boundary.

## Current implementation

The repository now contains a working first-generation career-agent control plane:

- `src/connectors.js` — platform/ATS capability registry with native/handoff/planned/blocked semantics
- `src/autonomy.js` — Research/Copilot/Supervised/Autopilot policy engine
- `src/CommandCenter.jsx` — connector inspection, form review and approval queue UI
- `src/AgentContext.jsx` — local profile, pipeline, autonomy, action queue, saved scout goals and run history
- `src/sourceIntel.js` — apply-route provenance intelligence
- `src/analytics.js` — response/interview/offer funnel analytics
- `src/evals.js` — deterministic application-package guardrails and evidence snapshots
- `api/ai.js` + `api/aiProviders.js` — resilient AI routing through direct Gemini and optional AI Gateway
- `api/jobs.js` + `api/_lib/jobSources.js` — multi-source JSearch plus public Greenhouse/Lever/Ashby ingestion
- `services/browser-worker/` — isolated Playwright inspection worker with strict ATS allowlists and no write authority
- `api/browser/inspect.js` — inspection-only browser-worker gateway
- `src/formPlanner.js` — evidence-bound form-field planning with manual-only sensitive/legal/CAPTCHA/2FA decisions
- `api/_lib/deviceIdentity.js` + `api/identity/session.js` — signed HttpOnly anonymous device identity boundary
- `api/scout/state.js` + `api/_lib/redisStore.js` — optional device-scoped durable scout state with revision/CAS protection
- `api/cron/scout.js` — bounded daily browser-closed discovery scheduler
- `src/ScoutCenter.jsx` — saved goals, explicit cloud sync, read-only background inbox and local personalized-review handoff
- `experiments/scrapers/scrapling/` — isolated ingestion benchmark with objective promotion criteria

See `docs/CONNECTORS.md`, `docs/BROWSER_WORKER.md`, `docs/BACKGROUND_SCOUT.md` and the other engineering notes for the individual trust boundaries.

## Next major subsystem

The next large subsystem should be **supervised prefill**, not unconstrained browser autonomy.

The existing worker can inspect ATS forms and the local form planner can decide which fields are evidence-backed. The next step is to create an approval-scoped prefill task that accepts only values the user has reviewed and that the planner marked safe.

A future prefill task should look conceptually like:

```json
{
  "connector": "greenhouse",
  "action": "prefill_application",
  "jobUrl": "https://...",
  "approvalScope": "prefill_only",
  "fields": [
    {
      "key": "full_name",
      "value": "reviewed local value",
      "evidenceSource": "profile.name"
    }
  ]
}
```

The worker should then:

1. validate the connector and approved origin again;
2. re-inspect the page before writing;
3. reject fields that disappeared, changed type, became sensitive/legal, or no longer match the approved plan;
4. fill only the explicitly approved field set;
5. return a structured diff/evidence report;
6. never click final submit under the prefill scope.

Final application submission remains a separate action with a separate policy decision and explicit approval. LinkedIn messaging/submission remains blocked unless an authorized platform integration exists.
