# OfferClaw Connector Architecture

OfferClaw follows an OpenClaw-style model: one persistent career agent, many replaceable connectors, explicit capabilities, durable state, and approval gates around external actions.

A connector is a **capability contract**, not a blanket claim that OfferClaw can automate a website.

## Capability states

| State | Meaning |
|---|---|
| `native` | Implemented inside OfferClaw today. |
| `handoff` | OfferClaw can prepare the action and open the external destination. |
| `approval` | A tested executor exists, but the action requires explicit user approval. |
| `planned` | Architecture supports the action but no safe executor exists yet. |
| `blocked` | OfferClaw intentionally does not automate the action. |

## Current connector posture

| Connector | Discovery | Prepare | Open apply | Prefill / submit | Outreach send |
|---|---|---|---|---|---|
| JSearch | Native | Native | Destination handoff | Depends on resolved destination | N/A |
| LinkedIn | Handoff | Native | Handoff | **Blocked** | **Blocked** |
| Indeed | Handoff | Native | Handoff | Planned approved integration | Planned approved integration |
| Naukri | Handoff | Native | Handoff | Planned approved integration/browser worker | Planned |
| Apna | Handoff | Native | Handoff | Planned approved integration/browser worker | Planned |
| Greenhouse | Native public feed when configured | Native | Handoff | **Approval — supervised worker** | Planned |
| Lever | Native public feed when configured | Native | Handoff | **Approval — supervised worker** | Planned |
| Ashby | Native public feed when configured | Native | Handoff | **Approval — supervised worker** | Planned |
| Workday / SmartRecruiters / Workable / Jobvite / iCIMS / BambooHR | Source-specific handoff / future adapter | Native | Handoff | Planned browser worker | Planned |
| Employer careers sites | Future direct ingestion + handoff | Native | Handoff | Planned verified-domain worker | Planned |
| Demo | Native synthetic data | Native | Blocked | Blocked | Blocked |

The exact registry used by the product lives in `src/connectors.js` and is protected by unit tests.

## Autonomy modes

OfferClaw separates *what a connector can do* from *what the user permits the agent to do*.

### Research

Search, read, rank and verify. No application actions.

### Copilot

Research plus application drafting and outreach drafting. External actions remain user-operated.

### Supervised Agent

The default. OfferClaw may inspect and prefill supported ATS forms and can prepare a final submit action, but write actions remain behind explicit user approval.

### Autopilot

Safe native actions may run automatically. Sensitive account-affecting actions such as final application submission and sending a message still require explicit approval, and connector-level blocks always win.

## Action lifecycle

```text
User goal
  -> planner chooses action
  -> connector resolves from destination
  -> capability check
  -> autonomy policy check
  -> inspection / evidence plan
  -> user approval when required
  -> scoped executor
  -> bounded outcome record
```

The current executor stack is intentionally layered:

1. approved URL handoff for platform/search/navigation actions;
2. read-only Playwright inspection for Greenhouse/Lever/Ashby hosted application pages;
3. network-frozen supervised prefill for direct profile-backed safe fields;
4. separate short-lived `submit_once` approval and connector-scoped one-click final submission.

Prefill permission cannot imply submit permission.

## Browser worker boundary

The live worker currently enables Greenhouse, Lever and Ashby only. It uses deterministic Playwright automation first and treats page content as untrusted data.

Manual/blocking checkpoints include:

- CAPTCHA
- two-factor authentication
- login requirements introduced during the workflow
- unresolved required fields
- legal declarations and attestations not explicitly reviewed
- demographic or sensitive-personal-data questions
- consent screens not explicitly reviewed

Before prefill, the browser is network-frozen and switched offline. Before final submit, the worker revalidates the retained form, consumes a fresh `submit_once` approval, and temporarily enables only connector-owned ATS submission traffic. There is no automatic retry; an attempted submission destroys the retained session after bounded outcome capture.

A recognized hostname alone never grants browser-write permission.

## LinkedIn boundary

LinkedIn is intentionally configured as research/user-handoff only. OfferClaw may build job-search and people-search destinations and prepare copy, but automated application submission and automated messaging are blocked in the connector contract.

That boundary is part of the code and tests, not just documentation.

## Ingestion versus action

Scrapling and similar experiments belong to **ingestion**: retrieving and normalizing permitted public job data. They are not application executors.

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

A connector can move from `planned` to `approval` only after its executor has connector-specific policy and regression tests. Do not add undocumented private APIs as production dependencies.

## Next implementation milestones

1. Surface the tested `submit_once` executor in the supervised review UI with explicit final confirmation and bounded local outcome evidence.
2. Add real-page connector fixtures/monitoring before expanding Greenhouse/Lever/Ashby assumptions.
3. Add another ATS family only after connector-specific inspection, prefill and submit policy tests pass.
4. Add approved OAuth email workflows for follow-up/outreach where appropriate.
5. Improve durable scheduled scouting/notifications and connector health/conversion analytics.
