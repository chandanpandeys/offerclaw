# OfferClaw

**An open-source persistent career agent for the whole job-search loop.**

OfferClaw is inspired by the OpenClaw-style idea of one persistent agent coordinating tools, memory, scheduled work and replaceable connectors. It specializes that pattern for careers: discover opportunities, verify source evidence, prepare defensible applications, supervise ATS browser actions, track outcomes and learn what converts.

![React](https://img.shields.io/badge/React-19.2-61dafb?style=flat-square) ![Vite](https://img.shields.io/badge/Vite-8.2-646CFF?style=flat-square) ![Gemini](https://img.shields.io/badge/Gemini-Interactions_API-4285F4?style=flat-square) ![Playwright](https://img.shields.io/badge/browser-Playwright-2EAD33?style=flat-square) ![Vercel](https://img.shields.io/badge/runtime-Vercel_Functions-black?style=flat-square) ![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)

## Why OfferClaw exists

Job hunting is fragmented. Search happens on multiple sources, application evidence lives somewhere else, forms repeat the same information, follow-ups are easy to forget, and most people never measure which sources or tactics actually produce responses.

OfferClaw puts those steps behind one career-agent control plane while keeping external actions explicit. It is **not** a mass-apply bot and does not pretend every platform permits the same automation.

## v1 capabilities

### Persistent scouting

- JSearch aggregation when configured.
- Public read-only Greenhouse, Lever and Ashby job-feed ingestion.
- Normalized/deduplicated results with source provenance.
- Saved role/location scout goals.
- Optional device-scoped cloud sync for scout goals + compact run evidence only.
- Optional daily browser-closed discovery through Vercel Cron + Upstash Redis.
- Background-discovery inbox with local profile-aware reruns when the user returns.

### Evidence-bound application preparation

- Local candidate profile and application pipeline.
- Gemini Interactions API through a server function, with optional Vercel AI Gateway failover/routing.
- Structured application packages: resume delta, match narrative, evidence gaps, cover letter, DM, email subject and proof checks.
- Deterministic checks for unsupported numeric claims and malformed/overlong package content.
- Bounded job-evidence and package-evaluation snapshots.
- Conservative template fallback when AI is unavailable.

### Supervised ATS application flow

The first live browser-action connectors are **Greenhouse, Lever and Ashby**.

```text
Live ATS role
   ↓
Read-only form inspection
   ↓
Local evidence/form plan
   ↓
Explicit safe-field prefill approval
   ↓
Network-frozen + offline Playwright prefill
   ↓
Short-lived screenshot review
   ↓
Deterministic submit readiness gate
   ↓
Fresh explicit submit_once approval
   ↓
Connector-scoped one-click submission
   ↓
Bounded local outcome evidence
```

Important boundaries:

- Candidate values are not sent during form inspection.
- Only direct profile-backed identity/contact/location/profile-link fields can enter automatic prefill.
- Salary, work authorization, screening questions, file uploads, demographic/legal/consent fields, CAPTCHA and 2FA stay outside the safe prefill protocol.
- Before approved values are written, page networking is frozen and the Playwright context is switched offline.
- Final submit is a separate short-lived approval after screenshot review.
- The submit worker allows only connector-scoped application traffic, clicks once and never automatically retries an uncertain result.
- Attempted browser sessions are destroyed after bounded outcome capture.
- Screenshots, form values, submit approval IDs and retained-session capabilities are never persisted to the application tracker.

See [`docs/BROWSER_WORKER.md`](docs/BROWSER_WORKER.md), [`docs/SUBMIT_ONCE.md`](docs/SUBMIT_ONCE.md) and [`SECURITY.md`](SECURITY.md) for the trust boundaries.

### Capability-honest connectors

OfferClaw models each integration as a capability contract rather than assuming a browser can do anything everywhere.

| Surface | v1 behavior |
|---|---|
| Greenhouse | native public discovery + supervised hosted-form actions |
| Lever | native public discovery + supervised hosted-form actions |
| Ashby | native public discovery + supervised hosted-form actions |
| JSearch | native aggregated discovery when configured |
| LinkedIn | research/search/apply handoffs; automated account writes blocked |
| Indeed | discovery/handoff unless an approved integration is configured |
| Naukri | conservative handoff / future authorized connector |
| Apna | conservative handoff / future authorized connector |
| Other ATS platforms | capability contracts exist; browser actions require separate testing before enablement |

OfferClaw does not fabricate recruiter identities or personal email addresses.

### Tracking and feedback

- Applied → response → interview → offer/rejected pipeline.
- Status history and follow-up state.
- Response/interview/offer funnel analytics.
- Source-level conversion breakdown.
- Average application-package evaluation score.
- Supervised-submit outcome classes, including uncertain attempts that are deliberately **not** counted as confirmed applications.

## Quick start — demo mode

Requirements: Node.js 22+ and npm.

```bash
git clone https://github.com/chandanpandeys/offerclaw.git
cd offerclaw
npm install
npm run dev
```

Open `http://localhost:5173`.

Plain Vite development does not provide the server routes under `/api`, so OfferClaw automatically falls back to demo listings and conservative template drafting. This is useful for exploring the UI without provider credentials.

## Full local runtime

OfferClaw's connected web runtime uses Vercel-compatible Functions under `api/`.

```bash
cp .env.example .env.local
```

Typical server-side configuration:

```text
# AI — configure one or both paths
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.7-flash
AI_GATEWAY_API_KEY=
AI_GATEWAY_MODEL=google/gemini-3.7-flash
AI_GATEWAY_FALLBACK_MODELS=
AI_GATEWAY_PROVIDER_ORDER=
AI_GATEWAY_ZDR=true

# Broad aggregated jobs
JSEARCH_API_KEY=

# Optional direct public ATS feeds
PUBLIC_ATS_SOURCES=

# Anonymous device identity + narrow scout cloud state
OFFERCLAW_IDENTITY_SECRET=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
CRON_SECRET=

# Separate isolated Playwright service
BROWSER_WORKER_URL=
BROWSER_WORKER_TOKEN=
```

Run with a local Vercel-compatible runtime (for example `vercel dev`) when you need the frontend and `/api` routes on the same origin.

**Never prefix server secrets with `VITE_`.** Vite-prefixed variables are intended for browser exposure.

## Architecture

```text
                          OfferClaw
                              │
                    Persistent career agent
                              │
       ┌──────────────────────┼──────────────────────┐
       │                      │                      │
   Local evidence         Scout state          Policy engine
 profile + tracker      goals + run history   approval/capability
       │                      │                      │
       └───────────────┬──────┴───────────┬──────────┘
                       │                  │
                Connector registry       │
                       │                  │
        ┌──────────────┼────────────┐     │
        │              │            │     │
      JSearch      Greenhouse     Lever  Ashby
        │              │            │     │
        └──────────────┴──────┬─────┴─────┘
                              │
                   normalized job evidence
                              │
                ┌─────────────┴─────────────┐
                │                           │
          AI preparation             supervised browser
     Gemini / AI Gateway          inspect → prefill → submit_once
                │                           │
                └─────────────┬─────────────┘
                              │
                    tracker + conversion
```

### Web/server boundaries

- `/api/ai` — server-side AI routing; prompts/output are not logged as operational telemetry.
- `/api/jobs` — multi-source job discovery and normalization.
- `/api/health` — secret-safe runtime readiness.
- `/api/identity/session` — signed HttpOnly anonymous device identity.
- `/api/scout/state` — optional device-scoped scout persistence with revision/CAS protection.
- `/api/cron/scout` — bounded daily discovery only; no server-side personalized ranking or application action.
- `/api/browser/inspect` — read-only ATS field inspection gateway.
- `/api/browser/prefill` — explicit safe-field prefill gateway.
- `/api/browser/prefill-session` — retained-session destruction.
- `/api/browser/submit` — short-lived `submit_once` gateway.

The Playwright worker is a **separate service boundary** under `services/browser-worker/`; it should not be treated as frontend code or an unrestricted remote browser.

## Privacy model

The candidate profile and application tracker are local-first browser data. Provider and browser-worker credentials stay server-side.

Optional scout sync is intentionally narrower than full account sync: it contains saved scout goals and compact run evidence, not the candidate profile, resume, application drafts or tracker.

AI drafting sends the evidence needed for the requested application package to the configured AI provider. Operators should review provider data-processing/retention settings. The AI Gateway path defaults to zero-data-retention routing when enabled.

Browser automation has an additional boundary: inspection sends no candidate values; prefill sends only explicitly approved fields to the isolated worker; the screenshot review stays in component memory; final submit returns bounded outcome metadata rather than request/response bodies.

## Listing confidence

The listing-confidence score is a **heuristic, not a fraud detector**. It uses the evidence available from the feed, such as freshness, compensation information, application destination and description detail. Important roles should still be verified on the employer/ATS source.

## Human routing

OfferClaw can create targeted people-search routes and outreach drafts, but it does not invent recruiter names, personal email patterns or verified identities. The user verifies the person before outreach.

LinkedIn automated messaging/submission remains blocked unless an authorized platform integration exists.

## Tech stack

- **Frontend:** React 19.2 + Vite 8.2 + vanilla CSS.
- **AI:** Gemini Interactions API, optional Vercel AI Gateway routing/fallback.
- **Jobs:** JSearch plus public Greenhouse/Lever/Ashby adapters.
- **Web runtime:** Vercel-compatible Functions.
- **Browser actions:** isolated Playwright 1.62 worker.
- **Optional durable scout state:** Upstash Redis REST.
- **Optional scheduler:** Vercel Cron, daily discovery-only model.
- **Local state:** browser `localStorage` for profile/pipeline/action state.
- **Testing:** Node built-in test runner + real Chromium worker tests.
- **CI:** GitHub Actions on Node 22 + Node 24, plus isolated browser-worker CI.

## Repository map

```text
api/
├── _lib/                  # AI, jobs, identity, Redis, browser gateway helpers
├── ai.js
├── jobs.js
├── health.js
├── identity/session.js
├── scout/state.js
├── cron/scout.js
└── browser/
    ├── inspect.js
    ├── prefill.js
    ├── prefill-session.js
    └── submit.js

src/
├── agent.js               # career-agent commands and application composition
├── connectors.js          # platform/ATS capability registry
├── autonomy.js            # Research/Copilot/Supervised/Autopilot policy
├── formPlanner.js          # evidence-bound application field decisions
├── submitReadiness.js      # deterministic final-submit gate
├── submissionOutcome.js    # bounded local submit evidence
├── ScoutCenter.jsx
├── CommandCenter.jsx
├── SupervisedPrefillCenter.jsx
├── Insights.jsx
└── AgentContext.jsx

services/browser-worker/
├── inspector.js
├── prefiller.js
├── submitter.js
├── security.js
├── sessionStore.js
└── test/

experiments/scrapers/scrapling/
└── reproducible Scrapling benchmark harness; not part of production runtime
```

## Scrapling experiment

The repository includes a reproducible Scrapling 0.4.15 ingestion benchmark under `experiments/scrapers/scrapling/`. It is deliberately isolated from production. The benchmark has objective promotion gates and offline CI; passing them would justify designing a separate ingestion service, not silently turning the web app into an unrestricted scraper.

## Quality gate

Every app pull request should pass:

```bash
npm ci
npm audit --omit=dev --audit-level=high
npm run lint
npm test
npm run build
```

The app gate runs on Node 22 and Node 24. Browser-worker changes additionally install Chromium and execute the isolated Playwright test suite, including network-exfiltration and one-shot submission fixtures.

## v1 release boundary

v1 focuses on a trustworthy vertical agent rather than maximum connector count.

Shipped:

- persistent scout goals + optional background discovery;
- multi-source job evidence;
- resilient AI routing;
- deterministic drafting/evidence evaluations;
- connector capability/policy model;
- supervised Greenhouse/Lever/Ashby inspect → prefill → screenshot → submit-once flow;
- application/source conversion analytics;
- local-first privacy with narrow optional scout sync.

Not promised in v1:

- automatic LinkedIn account activity;
- automatic Indeed/Naukri/Apna account actions without approved integrations;
- CAPTCHA/2FA solving;
- autonomous answers to sensitive/legal fields;
- fabricated recruiter identities/contact details;
- mass apply or automatic retry of uncertain submissions;
- guaranteed job legitimacy or hiring outcomes.

See [`LAUNCH.md`](LAUNCH.md) for the truth-first public launch kit and remaining production smoke-test checklist.

## Security

See [`SECURITY.md`](SECURITY.md). Vulnerabilities that could expose candidate data, provider credentials, retained browser sessions or submit approvals should be reported through a private GitHub security advisory rather than a public issue.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). High-value contributions include connector reliability, accessibility/mobile improvements, evaluations, source quality, browser-worker safety tests and authorized integrations.

## License

MIT — see [`LICENSE`](LICENSE).
