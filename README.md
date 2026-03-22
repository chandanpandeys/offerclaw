# HireOS Agent

**Quality-first AI job search agent.** Find real jobs, detect ghost postings, contact humans directly, and follow up at the right time — all from your browser.

> Built on research: 1 in 3 job postings are fake. 70% of jobs are never publicly posted. Mass-applying gets you flagged — personalised outreach gets you hired.

![Terminal-inspired dark UI](https://img.shields.io/badge/design-terminal--inspired-1a1a1a?style=flat-square) ![React](https://img.shields.io/badge/react-19-61dafb?style=flat-square) ![License: MIT](https://img.shields.io/badge/license-MIT-green?style=flat-square)

## Why HireOS?

Most job search tools take the **spray-and-pray** approach — apply to 1,000 jobs and hope for the best. The data says that doesn't work:

| Approach | Interview Rate | Source |
|---|---|---|
| Mass apply bots (AIHawk, LazyApply) | ~1-3% | Reddit surveys, Business Insider |
| Personalised direct outreach (HireOS approach) | **15-25%** contact rate | Cold email + follow-up industry research |

HireOS is different:
- **Ghost Detector** — flags stale, salary-less, and board-only postings before you waste time
- **Human Finder** — identifies the hiring manager and generates direct outreach
- **Anti-AI Content** — your cover letters and DMs don't sound like ChatGPT
- **Follow-Up Engine** — Day 3 DM, Day 5 email, Day 7 archive
- **Company Intel** — surfaces *why* a company is hiring (funding, growth signals)
- **Privacy-first** — your profile stays in your browser. API calls go directly to Google/RapidAPI — no intermediary server, no accounts.

## Quick Start

```bash
git clone https://github.com/YOUR-USERNAME/hireos-agent.git
cd hireos-agent
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Fill in the 30-second onboarding. Start with `find me jobs`.

## API Keys (Optional, BYOK)

HireOS works out of the box with demo data. For the full experience, add your own free API keys:

| Key | What it does | Free tier | Where to get it |
|---|---|---|---|
| **JSearch** (RapidAPI) | Real job listings from LinkedIn, Indeed, Glassdoor | 500 req/month | [rapidapi.com/jsearch](https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch) |
| **Gemini** (Google) | AI-personalised cover letters, DMs, resume bullets | Generous free tier | [aistudio.google.com](https://aistudio.google.com/app/apikey) |

All keys are stored in your browser's localStorage. Never sent to any server.

## Features

### Agent Chat
Type natural commands: `find me jobs`, `prepare 1`, `daily digest`, `export`, `help`

### Ghost Detector
Every listing is scored for legitimacy based on:
- Posting age (< 24h = best)
- Salary transparency
- Source quality (company site > LinkedIn > job board)
- Company signals (funding, hiring velocity)

### Application Composer
Generates 4 pieces per job — all anti-AI-detection:
1. **Resume Delta** — 3 bullets tailored to the specific role
2. **Cover Letter** — 4 sentences, company-specific, metric-backed
3. **LinkedIn DM** — 260 chars max, direct to hiring manager
4. **Email Subject** — Under 50 chars with a differentiator

### Follow-Up Engine
- **Day 3**: LinkedIn DM follow-up
- **Day 5**: Email follow-up
- **Day 7**: Auto-archive + refocus

### Pipeline Tracker
Track all applications with status, follow-up state, and export to CSV/JSON.

### Daily Digest
Morning sprint briefing: follow-ups due + application targets.

## Tech Stack

- **Frontend**: React 19 + Vite
- **Styling**: Vanilla CSS (dark terminal theme)
- **AI**: Gemini API (optional, BYOK)
- **Jobs**: JSearch API (optional, BYOK)
- **Storage**: Browser localStorage only

## Project Structure

```
src/
├── agent.js          # All agent skills + orchestrator
├── AgentContext.jsx   # React context (state management)
├── App.jsx           # All UI components
├── index.css         # Complete design system
└── main.jsx          # Entry point
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to add new agent skills, improve the UI, or integrate new job APIs.

## Research Basis

Every feature is backed by real data:
- **Ghost jobs**: 1 in 3 postings are fake (ResumeBuilder 2025, Clarify Capital)
- **AI detection**: 74% of recruiters detect AI content in 20 seconds (Forbes 2025)
- **Hidden market**: 70-80% of jobs are never publicly posted (LinkedIn, Apollo)
- **Follow-ups**: Day 3 follow-up significantly increases response rates
- **Direct outreach**: Referred candidates are 4-5x more likely to be hired

## License

MIT — see [LICENSE](LICENSE)
