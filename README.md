# OfferClaw

**Quality-first job search agent for people who would rather make three strong applications than spray hundreds of weak ones.**

OfferClaw ranks recent roles, exposes listing-risk signals, helps you find the right human to contact, creates truth-checked application drafts, and keeps follow-ups organized.

![React](https://img.shields.io/badge/React-19.2-61dafb?style=flat-square) ![Gemini](https://img.shields.io/badge/Gemini-Interactions_API-4285F4?style=flat-square) ![Vercel](https://img.shields.io/badge/runtime-Vercel_Functions-black?style=flat-square) ![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)

## Why this version matters

OfferClaw no longer treats an AI model or an API key as a frontend detail.

- Provider credentials stay **server-side**.
- Gemini calls use the **Interactions API**, not the legacy `generateContent` integration.
- The default model is configurable with `GEMINI_MODEL` and currently defaults to `gemini-3.7-flash`.
- AI application drafts use **structured JSON output** so the UI receives predictable fields.
- Demo and live listings are visibly different.
- Human Finder does **not invent email addresses or recruiter identities**.
- Resume/application generation is constrained to evidence present in the user's profile/resume.
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

```text
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.7-flash
JSEARCH_API_KEY=...
```

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
            └─ Gemini Interactions API
```

The browser never needs the Gemini or JSearch secret.

### API routes

- `GET /api/health` — reports which provider capabilities are configured without exposing secrets.
- `POST /api/jobs` — validates search input, calls JSearch, and returns a bounded result set.
- `POST /api/ai` — validates prompt size, applies a lightweight abuse guard, calls Gemini with `store: false`, and supports structured output.

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

- **Frontend:** React 19.2 + Vite 7
- **Styling:** Vanilla CSS
- **AI:** Gemini Interactions API through a server function
- **Jobs:** JSearch through a server function
- **Hosting/runtime:** Vercel-compatible functions
- **User storage:** browser `localStorage`
- **Tests:** Node's built-in test runner
- **Maintenance:** GitHub Actions + weekly Dependabot checks

Vite 8 is current upstream, but this repository stays on its existing locked Vite 7 toolchain until the upgrade is performed with a regenerated lockfile and verified as its own change rather than forcing a risky lockfile edit by hand.

## Project structure

```text
api/
├── ai.js               # Gemini Interactions API proxy
├── health.js           # Runtime capability check
└── jobs.js             # JSearch proxy
src/
├── agent.js            # Ranking, safety heuristics, agent commands, structured composer
├── agentContext.js     # Context + hook
├── AgentContext.jsx    # Local state/persistence provider
├── App.jsx             # Product UI
├── index.css           # Design system
└── main.jsx            # Entry point
test/
└── agent.test.js       # Core safety/decision tests
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

CI runs the same gate on GitHub Actions.

## Six-month engineering direction

Near-term improvements should prioritize capabilities that survive model/vendor churn rather than model-specific tricks:

1. **Provider abstraction and fallbacks** — add a second AI provider or gateway without changing product logic.
2. **Evaluation harness** — score resume drafts for unsupported claims, relevance, verbosity, and schema reliability.
3. **Ingestion benchmark** — decide whether the Scrapling path beats JSearch on freshness, completeness, reliability, and maintenance cost.
4. **Saved job evidence** — retain the exact job text/source used to generate an application so users can audit what the model saw.
5. **Optional encrypted sync** — keep local-first behavior while enabling multi-device pipelines for users who opt in.
6. **Accessibility and mobile pass** — make the workflow strong outside a desktop terminal-style layout.
7. **Toolchain upgrade** — move to Vite 8.x in a dedicated dependency PR after lockfile regeneration and browser verification.

## Security

See [SECURITY.md](SECURITY.md). Provider keys belong in the server environment. Resume text can contain sensitive personal data and is only sent to the configured AI provider when the user requests an application package.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Reliability, accessibility, evaluations, ingestion quality, tests, and provider abstraction are especially valuable contributions.

## License

MIT — see [LICENSE](LICENSE).
