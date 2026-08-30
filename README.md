# OfferClaw

**Quality-first AI job search agent.** Find fresher opportunities, sanity-check listings, identify the right human to contact, prepare tailored outreach, and keep follow-ups organized — directly in your browser.

![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square) ![Vite](https://img.shields.io/badge/Vite-7-646cff?style=flat-square) ![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)

## What it does

OfferClaw is deliberately not a mass-apply bot. It helps you spend more time on fewer, better-targeted applications.

- **Job Scout** — ranks fresh listings against your profile
- **Ghost Detector** — flags stale or low-signal postings before you spend time applying
- **Human Finder** — helps you locate the likely hiring manager and prepare direct outreach
- **Application Composer** — drafts role-specific resume deltas, cover letters, DMs, and email subjects
- **Follow-Up Engine** — keeps Day 3 / Day 5 / Day 7 follow-ups visible
- **Pipeline Tracker** — stores applications locally and exports CSV/JSON
- **Daily Digest** — turns the pipeline into a focused daily sprint
- **Demo mode** — works without API keys so the UI can be explored immediately

## Quick start

Requirements: Node.js 22+ and npm.

```bash
git clone https://github.com/chandanpandeys/offerclaw.git
cd offerclaw
npm install
npm run dev
```

Open `http://localhost:5173`, complete onboarding, and try `find me jobs`.

### Production check

```bash
npm run lint
npm run build
npm run preview
```

## Optional API keys (BYOK)

OfferClaw works in demo mode with no keys. For live data and AI-assisted writing, you can add your own keys in the app.

| Key | Purpose | Provider |
|---|---|---|
| **JSearch / RapidAPI** | Live job listings | RapidAPI JSearch |
| **Gemini API** | Tailored application content | Google AI Studio |

Keys and profile data are stored in browser `localStorage`; there is no OfferClaw account or application database. API requests are sent directly from your browser to the relevant provider.

> **Security note:** browser storage is convenient, not a secret vault. Only use keys with appropriate quotas/restrictions, do not reuse sensitive production credentials, and clear site data on shared devices. See [SECURITY.md](SECURITY.md).

## Agent commands

Use natural commands such as:

```text
find me jobs
prepare 1
daily digest
export
help
```

## How the ranking works

OfferClaw combines a simple profile match score with listing-quality signals such as:

- posting freshness
- salary transparency
- source quality
- visible company/hiring signals
- overlap with the skills in your profile

The Ghost Detector is a heuristic, not a guarantee. Treat it as a prioritization aid and verify important listings on the employer's official careers site.

## Application composer

For a selected role, OfferClaw can prepare:

1. **Resume Delta** — bullets to emphasize for this role
2. **Cover Letter** — short, company-specific draft
3. **LinkedIn DM** — concise outreach to the likely hiring contact
4. **Email Subject** — short subject line built around a differentiator

Generated content should always be reviewed before sending.

## Follow-up workflow

The default cadence is intentionally simple:

- **Day 3** — LinkedIn follow-up
- **Day 5** — email follow-up
- **Day 7** — archive or refocus

You can treat these as defaults rather than universal rules; adapt them to the company and application channel.

## Tech stack

- **Frontend:** React 19 + Vite 7
- **Styling:** Vanilla CSS
- **AI:** Gemini API, optional BYOK
- **Jobs:** JSearch API, optional BYOK
- **Storage:** browser `localStorage`
- **Backend:** none in the current production app

## Project structure

```text
src/
├── agent.js           # Agent skills and orchestration
├── AgentContext.jsx   # React context and local persistence
├── App.jsx            # Main UI
├── index.css          # Design system and layout
└── main.jsx           # Application entry point
```

Experimental ingestion work lives separately from the browser app so scraping ideas can be benchmarked before they are coupled to production.

## Current limitations

- Live search depends on third-party API availability and quotas.
- Hiring-manager discovery is assistive; it does not guarantee a verified contact identity or email address.
- Ghost-job scoring is heuristic and can produce false positives/negatives.
- Browser-only API keys are exposed to the browser runtime and should be scoped accordingly.
- There is currently no multi-device sync or hosted backend.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidance. Pull requests that improve reliability, accessibility, tests, data quality, or provider abstraction are especially useful.

## Release readiness

Every pull request should pass:

```bash
npm run lint
npm run build
```

CI runs the same checks on GitHub Actions.

## License

MIT — see [LICENSE](LICENSE).
