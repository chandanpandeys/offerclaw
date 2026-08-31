# OfferClaw

**Quality-first job search agent for people who would rather make three strong applications than spray hundreds of weak ones.**

OfferClaw ranks recent roles, exposes listing-risk signals, helps you find the right human to contact, creates truth-checked application drafts, and keeps follow-ups organized.

![React](https://img.shields.io/badge/React-19.2-61dafb?style=flat-square) ![Vite](https://img.shields.io/badge/Vite-8.2-646CFF?style=flat-square) ![Gemini](https://img.shields.io/badge/Gemini-Interactions_API-4285F4?style=flat-square) ![Vercel](https://img.shields.io/badge/runtime-Vercel_Functions-black?style=flat-square) ![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)

## Why this version matters

OfferClaw no longer treats an AI model or an API key as a frontend detail.

- Provider credentials stay **server-side**.
- Direct Gemini calls use the **Interactions API**, not the legacy `generateContent` integration.
- The default direct model is configurable with `GEMINI_MODEL` and currently defaults to `gemini-3.7-flash`.
- **Optional Vercel AI Gateway failover** can keep drafting available when the direct provider path is unavailable.
- The Gateway path supports provider ordering and configurable fallback models without changing product logic.
- Gateway requests default to **zero-data-retention routing** when that path is enabled.
- AI application drafts use **structured JSON output** so the UI receives predictable fields.
- AI calls emit request IDs, provider/model choice, failover state, and latency without logging resume prompts or generated content.
- Demo and live listings are visibly different.
- Human Finder does **not invent email addresses or recruiter identities**.
- Resume/application generation is constrained to evidence present in the user's profile/resume.
- Saved applications retain a bounded snapshot of the job evidence and deterministic package-evaluation results.
- The app remains useful without provider credentials through demo jobs and template drafting.

## Core workflow

1. Create a local candidate profile.
2. Run `find me jobs`.
3. Review match and listing-confidence signals.
4. Run `analyze 1` before investing time in a role.
5. Run `prepare 1` for a truth-checked application package.
6. Review evidence gaps and proof checks.
7. Apply, log the application, and follow up on Day 3 / Day 5.

Useful commands:

```text
find me jobs
analyze 1
prepare 1
daily digest
status
export
help
```

## Quick start — demo mode

Requirements: Node.js 22+ and npm.

```bash
git clone https://github.com/chandanpandeys/offerclaw.git
cd offerclaw
npm install
npm run dev
```

Open `http://localhost:5173`.

With plain Vite development, `/api/*` is not provided, so OfferClaw automatically falls back to demo listings and template application content. This makes the UI usable without any external account or secret.

## Full local runtime

The connected runtime uses Vercel Functions under `api/`.

Copy the environment template and add server-side credentials:

```bash
cp .env.example .env.local
```

Minimum direct-provider configuration:

```text
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.7-flash
JSEARCH_API_KEY=...
```

Optional resilient AI path:

```text
AI_GATEWAY_API_KEY=...
AI_GATEWAY_MODEL=google/gemini-3.7-flash
AI_GATEWAY_FALLBACK_MODELS=
AI_GATEWAY_PROVIDER_ORDER=
AI_GATEWAY_ZDR=true
```

When direct Gemini and AI Gateway are both configured, OfferClaw tries direct Gemini first and uses the Gateway if that provider path fails. The Gateway can also route across providers for the selected model and can be given fallback models through `AI_GATEWAY_FALLBACK_MODELS`.

On Vercel, Gateway authentication can also use the platform's OIDC token when available, so an explicit `AI_GATEWAY_API_KEY` is not required in that configuration.

Then run the project through Vercel's local runtime (for example with `vercel dev`) so the frontend and `/api` routes share the same origin.

**Never prefix these secrets with `VITE_`.** Vite-prefixed variables are intended to be exposed to browser code.

## Runtime architecture

```text
Browser
  ├─ React UI
  ├─ local profile + pipeline (localStorage)
  └─ same-origin requests
       ├─ POST /api/jobs
       │    └─ JSearch / RapidAPI
       └─ POST /api/ai
            ├─ Gemini Interactions API (preferred direct path)
            └─ Vercel AI Gateway (optional failover / provider routing)
```

The browser never needs Gemini, AI Gateway, or JSearch secrets.

### API routes

- `GET /api/health` — reports provider capability/failover readiness without exposing secrets.
- `POST /api/jobs` — validates search input, calls JSearch, and returns a bounded result set.
- `POST /api/ai` — validates prompt size, applies a lightweight abuse guard, tries configured AI paths in order, supports structured output, and returns request-level runtime metadata.

AI proxy logs intentionally contain operational metadata rather than candidate prompts or model output.

## Application package

For each selected role, OfferClaw can create:

- **Resume Delta** — what to emphasize or change without inventing achievements.
- **Match Narrative** — the strongest defensible overlap with the role.
- **Evidence Gaps** — requirements that are not supported by the current profile/resume.
- **Cover Letter** — concise, role-specific copy.
- **LinkedIn DM** — short direct outreach.
- **Email Subject** — a focused subject line.
- **Proof Checks** — reminders about claims that must remain verifiable.

If the AI runtime is unavailable, OfferClaw returns a conservative template package instead of failing the workflow.

Before a logged application is stored, deterministic checks flag obvious problems such as unsupported numeric claims, overly long outreach, missing proof checks, or malformed package shape. These checks complement model quality; they do not replace human review.

## Listing analysis

The listing-confidence score is a heuristic, not a fraud detector. It considers available signals such as:

- posting freshness
- presence of compensation data
- whether the application destination appears employer-controlled
- description detail
- presence of a usable application URL

Always verify important roles on the employer's official careers site.

## Human Finder

OfferClaw builds a targeted LinkedIn people-search route for the company and role. It intentionally does not fabricate personal email patterns, names, or recruiter identities. The user verifies the person before outreach.

## Follow-up workflow

Defaults:

- **Day 3** — short LinkedIn/check-in message
- **Day 5** — concise email follow-up
- **Day 7** — verify the opening, send one final useful note only if appropriate, then refocus

These are workflow defaults, not universal recruiting rules.

## Tech stack

- **Frontend:** React 19.2 + Vite 8.2
- **Styling:** Vanilla CSS
- **AI primary:** Gemini Interactions API through a server function
- **AI resilience:** optional Vercel AI Gateway provider/model routing
- **Jobs:** JSearch through a server function
- **Hosting/runtime:** Vercel-compatible functions
- **User storage:** browser `localStorage`
- **Tests:** Node's built-in test runner
- **Maintenance:** GitHub Actions on Node 22 + 24 and weekly Dependabot checks

## Project structure

```text
api/
├── _lib/
│   └── runtime.js       # Provider configuration/failover helpers
├── ai.js                # Gemini primary + optional AI Gateway failover
├── health.js            # Runtime capability/failover check
└── jobs.js              # JSearch proxy
src/
├── agent.js             # Ranking, safety heuristics, agent commands, structured composer
├── agentContext.js      # Context + hook
├── AgentContext.jsx     # Local state/persistence provider
├── evals.js             # Deterministic package/evidence evaluations
├── App.jsx              # Product UI
├── index.css            # Design system
└── main.jsx             # Entry point
test/
├── agent.test.js        # Core safety/decision tests
├── evals.test.js        # Application evidence/claim tests
└── runtime.test.js      # Provider routing/privacy tests
```

The Scrapling ingestion experiment remains isolated under its own PR/experiment track until benchmark results justify coupling a scraper service to production.

## Quality gate

Every pull request should pass:

```bash
npm ci
npm audit --omit=dev --audit-level=high
npm run lint
npm test
npm run build
```

CI runs the same gate on both Node 22 and Node 24.

## Six-month engineering direction

The foundation is now focused on capabilities that survive model/vendor churn rather than model-specific tricks.

Already in place:

1. **Provider abstraction and fallback path** — direct Gemini plus optional AI Gateway routing.
2. **Evaluation harness** — deterministic checks for unsupported numeric claims, length limits, package shape, gaps, and proof checks.
3. **Saved job evidence** — bounded source/job snapshots are stored with logged applications.
4. **Current toolchain compatibility** — React 19.2, Vite 8.2, ESLint 10, Node 22/24 CI.

Next priorities:

1. **Ingestion benchmark and source verification** — decide whether Scrapling or another source improves freshness/completeness enough to complement JSearch.
2. **Verified human routing** — enrich recruiter/hiring-manager discovery without guessing identities or addresses.
3. **Application conversion analytics** — response/interview/offer rates by source, role, package-eval score, and follow-up behavior.
4. **Accessibility and mobile pass** — make the workflow strong outside a desktop terminal-style layout.
5. **Production deployment + runtime observability** — connect the Vercel project, environment, logs, budgets, and live health checks.
6. **Optional encrypted sync** — preserve local-first behavior while enabling multi-device pipelines for users who opt in.

## Security

See [SECURITY.md](SECURITY.md). Provider keys belong in the server environment. Resume text can contain sensitive personal data and is only sent to the configured AI provider when the user requests an application package. The Gateway path defaults to zero-data-retention routing; operators should confirm the selected model/provider supports their required privacy policy before production use.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Reliability, accessibility, evaluations, ingestion quality, tests, and provider abstraction are especially valuable contributions.

## License

MIT — see [LICENSE](LICENSE).
