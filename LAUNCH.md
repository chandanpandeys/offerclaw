# OfferClaw v1.0.0 — Launch Kit

This file is the public-launch source of truth for OfferClaw.

The product is inspired by the OpenClaw idea of a persistent agent with memory, tools, scheduled work and replaceable connectors, but specialized for career workflows.

## Positioning

**Short:**

> OfferClaw is an open-source persistent career agent that scouts jobs, prepares evidence-bound applications, supervises ATS browser actions, tracks outcomes and learns what converts.

**One sentence:**

> Instead of operating five job portals manually, give OfferClaw your career goal and let one agent coordinate discovery, verification, preparation, supervised application actions, background scouting and follow-up state.

**What makes it different:**

- persistent search goals and browser-closed daily discovery
- multi-source job ingestion instead of a single job board
- evidence-bound drafting and deterministic claim checks
- connector capability honesty: native, handoff, approval-gated, planned or blocked
- supervised Greenhouse / Lever / Ashby form inspection, safe prefill, screenshot review and one-time final-submit approval
- no automatic retry after uncertain submission outcomes
- local-first profile/application state with optional narrow scout sync
- local response / interview / offer conversion analytics

## What v1 actually ships

### Discovery

- JSearch aggregation when configured
- public read-only Greenhouse job-board ingestion
- public read-only Lever postings ingestion
- public read-only Ashby postings ingestion
- normalized/deduplicated job results
- source/apply-route intelligence
- saved scout goals
- optional daily browser-closed discovery using Vercel Cron + device-scoped Redis state

### Application preparation

- local candidate profile
- server-side Gemini / optional Vercel AI Gateway routing
- evidence-bound application package generation
- deterministic unsupported-claim checks
- saved job evidence snapshots
- cover-letter / DM / email-subject / resume-delta preparation

### Supervised application actions

For supported Greenhouse, Lever and Ashby hosted forms:

1. inspect the live form without candidate values;
2. classify fields locally against candidate evidence;
3. keep sensitive/legal/CAPTCHA/2FA/unsupported fields outside automatic prefill;
4. ask for explicit safe-field prefill approval;
5. freeze networking and take the browser offline before values enter the DOM;
6. show a short-lived screenshot of the actual prefilled form;
7. run a deterministic final-submit readiness check;
8. require a separate short-lived `submit_once` confirmation;
9. permit only connector-scoped submission traffic;
10. click once, never automatically retry, destroy the retained session after an attempt, and store bounded local outcome evidence.

### Tracking and learning

- application tracker
- status history
- response / interview / offer funnel
- source-level conversion breakdown
- application-package evaluation scores
- background-discovery inbox
- local personalized reruns of background candidates

## Important capability boundaries

Do **not** launch with claims that OfferClaw can automatically apply everywhere.

Current platform posture:

| Surface | v1 behavior |
|---|---|
| Greenhouse | native public job discovery + supervised hosted-form actions |
| Lever | native public job discovery + supervised hosted-form actions |
| Ashby | native public job discovery + supervised hosted-form actions |
| JSearch | native aggregated discovery when configured |
| LinkedIn | research/search/apply handoffs; automated account writes remain blocked |
| Indeed | discovery/handoff unless an approved integration is configured |
| Naukri | conservative handoff / future authorized connector |
| Apna | conservative handoff / future authorized connector |
| Workday / other ATS | connector contract exists; live browser actions require separate testing before enablement |

Do **not** claim:

- "no backend" — OfferClaw now uses server functions and an isolated browser-worker boundary;
- "all data stays in the browser" — profile/tracker are local-first, while optional scout sync stores only saved goals + compact run evidence;
- "LinkedIn/Indeed/Naukri auto-apply" — that is not a v1 capability;
- guaranteed hiring-manager identity or guessed personal email addresses;
- guaranteed detection of fake/ghost jobs;
- guaranteed interview/offer-rate improvements;
- automatic CAPTCHA/2FA solving;
- unrestricted autonomous browser control.

## Launch prerequisites

Do not start the public distribution sequence until these are true:

- [x] Node 22 + Node 24 production CI green
- [x] Browser-worker Chromium security/execution tests green
- [x] Greenhouse/Lever/Ashby submit-once executor merged
- [x] final screenshot-review → explicit submit approval UI merged
- [x] Vercel Git deployment check green on current `master`
- [ ] production `/api/health` reviewed with expected providers/configuration
- [ ] isolated browser worker deployed and reachable from production
- [ ] at least one real permitted Greenhouse/Lever/Ashby end-to-end smoke test completed
- [ ] mobile UI smoke test completed
- [ ] README screenshots/demo refreshed from current product
- [ ] repository About/description/topics point to the production URL
- [ ] final `v1.0.0` tag/release + changelog created
- [ ] replace `<github-url>` and `<production-url>` placeholders below

## 90-second demo script

Use one real public role that permits normal applicant access. Avoid showing private tokens, email inboxes or sensitive profile details.

**0–10s — outcome**

> "OfferClaw is an open-source career agent inspired by OpenClaw. You give it a job-search goal; it coordinates discovery, application preparation, supervised actions and tracking."

Show the main app + Scout Center.

**10–25s — persistent scouting**

Create/open a saved goal such as `AI Engineer · Bengaluru/Remote`. Show source provenance and the background-discovery inbox.

**25–40s — evidence-bound preparation**

Select one role. Show the evidence/job snapshot and generated application package. Point out proof checks/gaps instead of claiming the model is always correct.

**40–65s — supervised ATS flow**

Open a supported ATS role. Show:

`Inspect → field plan → safe prefill approval → frozen screenshot review`.

Emphasize that candidate values are not sent during inspection and networking is frozen before prefill values enter the page.

**65–80s — final action boundary**

Show the separate `Approve & submit once` confirmation. Explain connector-scoped traffic, one click and no automatic retry.

Use a non-production fixture/demo if a real submission would create an unwanted application.

**80–90s — feedback loop**

Show tracker + Insights with applied/response/interview/offer stages and source conversion.

End:

> "The goal isn't mass apply. It's one persistent agent coordinating the boring parts while keeping evidence and account-affecting actions explicit."

---

# Launch copy

## Hacker News — Show HN

**Title**

`Show HN: OfferClaw – an open-source persistent agent for job hunting`

**Draft**

Hi HN,

I built OfferClaw, an open-source career agent inspired by the persistent-agent/tooling model behind projects like OpenClaw.

The problem I wanted to solve wasn't "generate another cover letter." It was the fragmentation of job hunting: search in several places, verify the listing, tailor an application, fill forms, remember follow-ups, and then have no idea which source or strategy actually converted.

OfferClaw keeps those steps behind one agent/control plane:

- multi-source discovery through JSearch plus public Greenhouse/Lever/Ashby feeds
- saved search goals + optional browser-closed daily discovery
- evidence-bound application drafting with deterministic claim checks
- a connector registry that says whether an action is native, a handoff, approval-gated or blocked
- supervised Greenhouse/Lever/Ashby application forms: read-only inspection → safe-field prefill → frozen screenshot review → separate one-time submit approval
- local application/outcome tracking and source conversion analytics

I deliberately did not build "click Apply 1,000 times." LinkedIn automated account writes stay blocked, CAPTCHA/2FA/legal/sensitive fields stay manual, and an uncertain final submission is never automatically retried.

The browser worker is isolated from the React app and has explicit connector/egress policies. Candidate values are not sent during form inspection; before approved values are written during prefill, the browser's networking is frozen and Playwright is switched offline. Final submit is a separate short-lived approval.

Stack: React 19, Vite 8, Vercel Functions, Gemini/AI Gateway, Playwright worker, optional Upstash Redis + Vercel Cron.

Demo: <production-url>
GitHub: <github-url>

I'd especially value feedback on the connector/security model and on where the boundary between useful automation and applicant-controlled actions should sit.

---

## Reddit — r/SideProject / r/webdev / relevant open-source communities

**Title**

`I built OfferClaw: an open-source persistent career agent, not a mass-apply bot`

**Draft**

I've been building OfferClaw around a simple idea: job hunting should feel like operating one agent, not manually juggling several portals, documents and follow-up notes.

v1 can:

- discover jobs from multiple configured sources;
- save recurring role/location goals and run optional daily discovery while the browser is closed;
- prepare evidence-bound application material;
- inspect supported ATS forms without sending candidate values;
- prefill only explicitly reviewed profile-backed fields;
- show a frozen screenshot before final action;
- require a separate one-time confirmation for a supported ATS submission;
- track response/interview/offer outcomes so you can see which sources convert.

The browser automation is intentionally narrow. Greenhouse, Lever and Ashby are the first tested hosted-form connectors. LinkedIn account automation is blocked, CAPTCHA/2FA/sensitive/legal fields remain manual, and the worker never automatically retries an uncertain submission.

Stack: React 19 + Vite 8 + Vercel Functions + Gemini/AI Gateway + Playwright, with optional Redis/Cron for background scouts.

MIT licensed.

Demo: <production-url>
GitHub: <github-url>

Feedback on the product and the browser-agent security boundary is welcome.

---

## LinkedIn post

I’ve been working on **OfferClaw**, an open-source persistent career agent inspired by the OpenClaw-style idea of one agent coordinating tools, memory and scheduled work.

Instead of another AI cover-letter generator, I wanted a system that can coordinate the job-search loop:

**discover → verify → prepare → review → act → track → learn**

v1 includes multi-source job discovery, saved/background scouts, evidence-bound application drafting, source conversion analytics, and a supervised ATS workflow for Greenhouse/Lever/Ashby.

The application flow is intentionally not "full autopilot": OfferClaw inspects the form first, prefills only reviewed evidence-backed fields in a frozen browser, shows the actual prefilled screenshot, and asks separately before a one-time final submit. It never automatically retries an uncertain result.

I also keep capability boundaries explicit: LinkedIn write automation stays blocked, CAPTCHA/2FA/legal/sensitive fields stay manual, and the app doesn't invent recruiter emails or candidate facts.

Demo: <production-url>
Code: <github-url>

I’m looking for feedback from people building agents, browser automation, recruiting tools, or just going through a job search right now.

---

## X / Twitter thread

**Post 1**

I built OfferClaw: an open-source persistent agent for job hunting.

Not "AI Easy Apply x1000."

One agent coordinating:
search → evidence → application prep → supervised ATS actions → follow-up state → conversion analytics.

<github-url>

**Post 2**

The architecture is closer to an agent control plane than a job board:

• replaceable job-source connectors
• persistent scout goals
• scheduled background discovery
• local candidate evidence
• approval-gated browser worker
• outcome tracking

**Post 3**

The browser boundary was the interesting part.

For supported Greenhouse/Lever/Ashby forms:

inspect with no candidate values → locally decide safe fields → freeze networking → prefill → screenshot review → separate submit-once approval.

**Post 4**

An uncertain submit is never automatically retried.

LinkedIn automated writes remain blocked.
CAPTCHA/2FA/sensitive/legal fields remain manual.
No guessed recruiter emails.
No fabricated resume facts.

Automation should know what it is *not* allowed to do.

**Post 5**

React 19 + Vite 8 + Vercel Functions + Gemini/AI Gateway + Playwright + optional Upstash/Vercel Cron.

MIT licensed.

Demo: <production-url>
Code: <github-url>

---

## Product Hunt

**Name**

OfferClaw

**Tagline**

`A persistent open-source career agent for the whole job-search loop`

**Short description**

OfferClaw coordinates multi-source job discovery, evidence-bound application preparation, background scouting, supervised ATS actions and outcome analytics from one persistent career-agent workflow.

**Feature bullets**

- Multi-source job scouting
- Persistent saved goals + background discovery
- Evidence-bound AI application preparation
- Supervised Greenhouse/Lever/Ashby browser workflow
- Separate one-time final-submit approval
- Local-first candidate state
- Response/interview/offer analytics
- Open source (MIT)

**Maker note angle**

Talk about why the project intentionally chose supervised actions over mass application automation, and how the connector/policy design prevents a page or model from widening its own permissions.

---

# Distribution sequence

The goal is concentrated feedback, not posting the same copy everywhere at once.

| Day | Channel | Goal |
|---|---|---|
| Day 0 | GitHub | `v1.0.0` release, README/demo/screenshots, clean production URL |
| Day 1 | Hacker News | technical feedback + early OSS users |
| Day 1 | LinkedIn | professional network + recruiters/AI engineers |
| Day 2 | X/Twitter | agent/browser-automation developer reach |
| Day 3 | Reddit | job-seeker + side-project + webdev feedback, subreddit rules permitting |
| Day 4–6 | GitHub/communities | respond to issues, ship fixes, share technical write-up |
| Day 7+ | Product Hunt | broader polished launch after early feedback fixes |

## Launch-day operating rules

- Do not buy votes/upvotes or coordinate fake engagement.
- Read each community's self-promotion rules before posting.
- Reply to technical criticism with implementation details, not marketing language.
- Turn repeated questions into README/FAQ improvements.
- Capture bugs as GitHub issues and fix high-signal launch blockers quickly.
- Do not expose candidate data, provider secrets, worker tokens or private job applications in demos/screenshots.
- If a connector is degraded, say so instead of implying every feature is live.

## Metrics worth watching

Prefer product-quality signals over raw impressions:

- GitHub stars/forks/watchers
- unique demo visitors
- successful first scout run
- saved scout goal creation
- application-package generation
- supervised inspection success rate
- prefill review creation rate
- submit outcome classes (counts only, no candidate content)
- user-reported bugs
- returning users
- response/interview/offer outcomes for users who choose to track them

Do not optimize the product toward raw application volume.
