# Contributing to OfferClaw

Thank you for your interest in making job search better for everyone! Here's how to contribute.

## Setup

```bash
git clone https://github.com/YOUR-USERNAME/hireos-agent.git
cd hireos-agent
npm install
npm run dev
```

## Code Style

- **No TypeScript required** — keeping the barrier to contribution low
- Use `const` by default, `let` when mutation is needed
- Functions over classes
- Comments explain *why*, not *what*

## How to Add a New Agent Skill

1. Open `src/agent.js`
2. Add your skill function (export it):
```js
export function skillMyNewSkill(job, profile) {
  // Your logic here
  return { /* result */ }
}
```
3. Wire it into `runAgent()` — add an intent match in the if/else chain
4. Update `src/App.jsx` if the skill needs UI

## How to Contribute

1. **Fork** the repository
2. Create a **feature branch**: `git checkout -b feat/my-feature`
3. Make your changes
4. Run `npm run build` to verify no errors
5. **Open a PR** with a clear description of what you changed and why

## What We Need Help With

- [ ] More job API integrations (Indeed API, Google Jobs, Adzuna)
- [ ] Real company signal detection (Crunchbase, LinkedIn)
- [ ] Interview prep agent skill
- [ ] ATS resume scoring
- [ ] Internationalisation (i18n)
- [ ] Mobile responsiveness
- [ ] Browser extension for auto-fill

## Ground Rules

- **Outcome > code** — every feature must help someone get closer to a job
- **Anti-AI aesthetic** — UI should look like a tool, not a chatbot
- **Privacy-first** — no data leaves the browser without explicit user action
- **Quality > quantity** — we're the opposite of spray-and-pray
