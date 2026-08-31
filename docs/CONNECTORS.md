# OfferClaw Connector Architecture

OfferClaw is moving toward an OpenClaw-style model: one persistent career agent, many replaceable connectors, explicit capabilities, durable state, and approval gates around external actions.

A connector is a **capability contract**, not a claim that OfferClaw can automate a website.

## Capability states

| State | Meaning |
|---|---|
| `native` | Implemented inside OfferClaw today. |
| `handoff` | OfferClaw can prepare the action and open the external destination after user approval. |
| `approval` | The connector can support the action only with explicit user approval. |
| `planned` | Architecture supports the action but no safe executor exists yet. |
| `blocked` | OfferClaw intentionally does not automate the action. |

This distinction prevents the UI or agent planner from presenting future browser automation as if it already works.

## Current connector posture

| Connector | Discovery | Prepare | Open apply | Prefill / submit | Outreach send |
|---|---|---|---|---|---|
| JSearch | Native | Native | Destination handoff | Planned by destination | N/A |
| LinkedIn | Handoff | Native | Handoff | **Blocked** | **Blocked** |
| Indeed | Handoff | Native | Handoff | Planned approved integration | Planned approved integration |
| Naukri | Handoff | Native | Handoff | Planned approved integration/browser worker | Planned |
| Apna | Handoff | Native | Handoff | Planned approved integration/browser worker | Planned |
| Greenhouse / Lever / Workday / Ashby / other ATS | Source-specific handoff | Native | Handoff | Browser-worker candidate | Planned |
| Employer careers sites | Future direct ingestion + handoff | Native | Handoff | Browser-worker candidate | Planned |
| Demo | Native synthetic data | Native | Blocked | Blocked | Blocked |

The exact registry used by the product lives in `src/connectors.js` and is protected by unit tests.

## Autonomy modes

OfferClaw separates *what a connector can do* from *what the user permits the agent to do*.

### Research

Search, read, rank and verify. No application actions.

### Copilot

Research plus application drafting and outreach drafting. External actions remain user-operated.

### Supervised Agent

The default. OfferClaw can queue external handoffs and future browser-worker actions, but the user approves them.

### Autopilot

Safe native actions may run automatically. Sensitive external actions such as final application submission and sending a message still require explicit approval, and connector-level blocks always win.

## Action lifecycle

```text
User goal
  -> planner chooses action
  -> connector resolves from destination
  -> capability check
  -> autonomy policy check
  -> action queue
  -> user approval when required
  -> executor
  -> completion / rejection / failure record
```

The first executor is intentionally simple: approved URL handoff. It opens a platform or verification destination and records the action outcome. Browser form filling is a separate future executor rather than hidden inside the connector registry.

## Browser worker direction

A future browser worker should use deterministic browser automation first (for example Playwright), with AI recovery only where layout variability makes deterministic selectors insufficient.

The worker must treat the following as manual checkpoints rather than obstacles to bypass:

- CAPTCHA
- two-factor authentication
- legal declarations and attestations
- demographic or sensitive-personal-data questions
- consent screens
- final submission where the connector/policy requires approval

Browser automation should run against an explicit allowlist of connectors and actions. A new connector must not gain browser-write capability merely because its hostname is recognized.

## LinkedIn boundary

LinkedIn is intentionally configured as research/user-handoff only. OfferClaw may build job-search and people-search destinations and prepare copy, but automated application submission and automated messaging are blocked in the connector contract.

That boundary is part of the code and tests, not just documentation.

## Ingestion versus action

Scrapling and similar experiments belong to **ingestion**: retrieving and normalizing permitted public job data.

They are not application executors.

```text
Ingestion
  APIs / feeds / permitted Scrapling sources
        |
        v
Normalized job record
        |
        v
Connector + source intelligence
        |
        v
Agent planner / ranking / drafting
        |
        v
Approval-gated action executor
```

This keeps data acquisition, reasoning, and account-affecting actions independently replaceable.

## Adding a connector

A connector should declare:

- stable `id`
- display name
- connector kind (`job_board`, `ats`, `employer_site`, etc.)
- hostname matchers when appropriate
- implementation status
- per-action capability states
- a concise boundary note

Then add tests for both connector resolution and any sensitive action policy. Do not add undocumented private APIs as production dependencies.

## Next implementation milestones

1. Native approved source adapters behind the connector interface.
2. A Playwright browser-worker service for allowlisted ATS/employer application forms.
3. Structured form-field planning and evidence-bound answer generation.
4. A review screen showing every field before submission.
5. OAuth email connector for application/follow-up workflows.
6. Durable scheduled scouting outside the browser session.
7. Connector health, success-rate and conversion analytics so weak adapters can be disabled automatically.
