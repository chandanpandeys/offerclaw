# HireOS Agent — Launch Posts

Ready-to-use drafts for launching on HN, Reddit, Product Hunt, and Twitter/X.

---

## 1. Hacker News — Show HN

**Title:** `Show HN: HireOS Agent – open-source AI job search that detects ghost jobs and contacts humans`

**Body:**

Hi HN,

I built an open-source job search agent that takes a different approach from the "apply to 1,000 jobs" tools.

**The problem:** 1 in 3 job postings are fake (ResumeBuilder 2025). 70-80% of jobs are never publicly posted. Meanwhile, AIHawk/LazyApply spam recruiters with AI-generated content — and 74% of recruiters can detect it in 20 seconds.

**What HireOS does differently:**

- **Ghost Detector** — scores every listing for legitimacy (posting age, salary transparency, source quality)
- **Human Finder** — identifies the hiring manager + generates email patterns, not just "Easy Apply"
- **Anti-AI Content** — cover letters and DMs that don't sound like ChatGPT (bans "passionate", "leverage", "synergy")
- **Follow-Up Engine** — Day 3 DM, Day 5 email, Day 7 archive
- **3/day sprint** — research shows 3 quality applications beat 100 random ones

**Tech:** React 19 + Vite. No backend. All data stays in your browser. Optional BYOK: JSearch API for real listings, Gemini for AI personalization.

**Stack decision:** Pure frontend — no server, no auth, no data collection. Fork and deploy in 5 minutes.

GitHub: [link]

Would love feedback on the ghost detection algorithm and the anti-AI prompting strategy.

---

## 2. Reddit — r/cscareerquestions

**Title:** `I built an open-source job search tool that detects ghost jobs and contacts the hiring manager directly — here's the research behind it`

**Body:**

Been lurking here long enough to know the pain. Applied to 200+ jobs, got ghosted, found out half the postings were fake. So I dug into the research:

- **1 in 3 job postings are fake** (ResumeBuilder, Clarify Capital 2025)
- **74% of recruiters detect AI-generated content** in 20 seconds (Forbes)
- **70% of jobs are never posted publicly** — filled through referrals and direct contact
- **Day 3 follow-up** significantly increases your response rate
- **Applying within 24h** of posting = best conversion

I built HireOS Agent based on these findings. It's open source, runs in your browser, and does this:

1. **Finds jobs** from real APIs (LinkedIn, Indeed, Glassdoor via JSearch)
2. **Checks if they're ghost jobs** before you waste time
3. **Identifies the hiring manager** and generates a DM/email that doesn't sound AI-generated
4. **Reminds you to follow up** at the right intervals
5. **Tracks everything** so you know your response rate

It's NOT a mass-apply bot. Target is 3 quality applications/day, not 1,000 random ones.

No account needed. No data leaves your browser. Free.

GitHub: [link]

If you want to contribute — the biggest need right now is more job API integrations and interview prep.

---

## 3. Reddit — r/webdev / r/sideproject

**Title:** `Open-sourced my job search agent — React 19, no backend, research-driven features [Show off Saturday]`

**Body:**

Built this over the past few weeks. It's a job search agent that runs entirely in the browser.

**Tech stack:**
- React 19 + Vite
- Vanilla CSS (dark terminal theme, no Tailwind)
- JSearch API for real job data
- Gemini API for AI content generation
- localStorage only — zero backend

**Features:**
- Ghost job detection (research says 1 in 3 postings are fake)
- Hiring manager identification with email pattern guessing
- Anti-AI cover letter generation (bans generic ChatGPT phrases)
- Day 3/5/7 follow-up engine
- CSV/JSON export
- Daily sprint system (3 apps/day target)

**What I learned building it:**
- localStorage-only architecture is surprisingly powerful for privacy-first tools
- The anti-AI-detection prompting (explicitly banning generic phrases) produces dramatically better content
- Ghost detection is basically: freshness + salary transparency + source quality

**Design decision:** Terminal-inspired dark UI on purpose. The "chatbot with a smiley face" look makes people distrust AI tools. This needed to feel like a power tool, not a toy.

GitHub: [link]

Happy to answer questions about the architecture or the research.

---

## 4. Product Hunt

**Tagline:** `Quality-first AI job search agent — because 1 in 3 job postings are fake`

**Description:**
HireOS Agent is an open-source AI tool that finds you real jobs, detects ghost postings, identifies the hiring manager, and generates content that doesn't sound AI-generated.

Unlike mass-apply bots, HireOS focuses on 3 quality applications per day — the approach research shows actually gets interviews.

**Key features:**
🔍 Ghost Detector — flags fake/stale postings before you apply
👤 Human Finder — identifies the hiring manager, not just the form
✍️ Anti-AI Content — cover letters recruiters actually read
📅 Follow-Up Engine — Day 3 DM, Day 5 email, Day 7 archive
🔐 Privacy-first — everything in your browser, no accounts

**Built with:** React 19, Vite, JSearch API, Gemini API
**Price:** Free, open source (MIT)

---

## 5. Twitter/X Thread

**Tweet 1 (Hook):**
1 in 3 job postings are fake.

74% of recruiters detect AI cover letters in 20 seconds.

70% of jobs are never publicly posted.

I built a free, open-source tool based on these findings. Thread 🧵

**Tweet 2:**
Most job search tools take the "spray and pray" approach.

Apply to 1,000 jobs. Hope for the best.

Result: ~1-3% interview rate. And you might get your LinkedIn account banned.

HireOS takes the opposite approach: 3 quality applications per day.

**Tweet 3:**
Every listing runs through a Ghost Detector:

✓ How old is the posting? (<24h = best)
✓ Is salary listed? (real intent signal)
✓ Is it from a company career page? (less competition)
✓ Are there hiring signals? (funding, blog activity)

**Tweet 4:**
Instead of clicking "Easy Apply" into the void, HireOS finds the actual hiring manager.

→ LinkedIn profile
→ Email pattern guesses
→ A 2-sentence DM that doesn't sound like ChatGPT wrote it

Research: direct contact = 15-25% response rate vs 1-3% for mass apply.

**Tweet 5:**
Follow-up is where most people drop the ball.

HireOS tracks your applications and prompts:
• Day 3 → LinkedIn follow-up DM
• Day 5 → Email follow-up
• Day 7 → Archive and move on

**Tweet 6:**
It's 100% free, open source, and runs in your browser.

No account. No data sent to any server. Bring your own API keys (free tiers available).

GitHub: [link]

Star it if it helps. Contributions welcome — especially job API integrations and interview prep.

---

## Launch Timeline

| Day | Platform | Action |
|---|---|---|
| **Day 0** | Twitter/X | Teaser tweet with ghost job stat |
| **Day 1** | Hacker News | Show HN post (morning PST) |
| **Day 1** | Twitter/X | Full thread |
| **Day 2** | Reddit | r/cscareerquestions + r/webdev |
| **Day 3** | GitHub | Tag v1.0.0 release with changelog |
| **Day 7** | Product Hunt | Full launch with screenshots |

> **Key**: Respond to EVERY comment in the first 24h. Authentic engagement > upvote count.
