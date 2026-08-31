# Scraper Experiment 001 — Scrapling

This is OfferClaw's isolated direct-source ingestion experiment. It does **not** run in the React app or replace JSearch. Its job is to answer one question with evidence: does direct extraction from permitted public career pages improve freshness/completeness enough to justify operating a separate ingestion service?

## Current dependency

The experiment pins `scrapling[fetchers]==0.4.15`, the current release as of August 2026.

## Safety boundary

- CI never fetches live job sites.
- Live benchmark URLs are supplied manually and must be pages you are permitted to access.
- Keep request rates conservative and respect site terms, robots policies, and applicable law.
- Browser/stealth modes are explicit fallbacks, not defaults.
- Cloudflare solving is opt-in and should only be used where permitted.

## Setup

Requires Python 3.10+.

```bash
cd experiments/scrapers/scrapling
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Browser-backed modes additionally need Scrapling's browser/runtime installation:

```bash
scrapling install
```

## Deterministic tests

These tests make no network requests:

```bash
python -m unittest test_extract.py test_decision.py
```

They verify Schema.org `JobPosting` normalization and the promote/keep-experimental decision gate.

## One permitted page

Start with HTTP mode:

```bash
python scrape_job.py "https://company.example/jobs/123" --mode http
```

Only escalate when the page genuinely requires it:

```bash
python scrape_job.py "https://company.example/jobs/123" --mode dynamic
python scrape_job.py "https://company.example/jobs/123" --mode stealth
```

## Representative benchmark

Use at least five distinct permitted employer sources; more is better.

```bash
python benchmark.py \
  "https://company-a.example/jobs/123" \
  "https://company-b.example/careers/456" \
  "https://company-c.example/jobs/789" \
  "https://company-d.example/careers/101" \
  "https://company-e.example/jobs/202" \
  --modes http dynamic \
  --runs 3 \
  --cooldown 2 \
  --output results.json
```

The report contains raw rows, per-source/per-mode summaries, and a decision object.

## Promotion gate

A `promote_candidate` verdict requires all of the following:

| Gate | Required |
|---|---:|
| Distinct sources | >= 5 |
| Successful fetch rate | >= 95% |
| Mean core-field completeness | >= 0.80 |
| HTTP-mode success rate | >= 70% |

We also record JSON-LD extraction rate and latency, but they are diagnostic rather than hard gates because source mix and network geography can distort them.

`promote_candidate` means only that it is worth designing a production ingestion service/API. It does **not** authorize scraping, automatically merge source-specific behavior, or replace JSearch.

## Normalized record

The experiment emits:

- title
- company
- location
- description
- date posted
- employment type
- salary
- apply URL

Extraction order is structured `JobPosting` JSON-LD first, then conservative DOM fallback. Completeness is reported explicitly rather than silently treating partial extraction as complete.

## Production path if it clears the gate

1. Keep scraping server-side; never ship Scrapling into browser code.
2. Add domain allow/deny and rate policies.
3. Store source URL, fetched timestamp, and extraction strategy as provenance.
4. Feed normalized jobs through OfferClaw's existing apply-route/source-intelligence layer.
5. Run JSearch and direct-source ingestion side-by-side until freshness/quality gains are demonstrated in real usage.
