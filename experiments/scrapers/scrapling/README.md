# Scraper Experiment 001 — Scrapling

The first OfferClaw direct-source scraping experiment. The goal is to evaluate whether Scrapling can reliably turn public job-posting pages into a normalized record before we build source-specific adapters.

## Why Scrapling first

Scrapling combines a fast HTTP fetcher, browser-backed dynamic fetching, stealth fetching, CSS/XPath parsing, adaptive selectors, and a spider framework in one Python package. This experiment uses the current `0.4.15` release and keeps anti-bot features opt-in.

## What this experiment measures

For every fetch we record:

- fetch mode: `http`, `dynamic`, or `stealth`
- HTTP status when available
- fetch latency in milliseconds
- extraction strategy: `json-ld` or `dom-fallback`
- field completeness across title, company, location, description, and apply URL
- the normalized job record

The shared output shape is intentional: the next scraper experiments should emit the same fields so we can compare libraries rather than demos.

## Setup

Requires Python 3.10+.

```bash
cd experiments/scrapers/scrapling
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt
scrapling install
```

`pip install "scrapling[fetchers]"` is required for the fetcher classes. `scrapling install` installs the browser/runtime dependencies needed by browser-backed modes.

## Verify the extractor

The fixture test exercises the structured-data normalization without making a network request:

```bash
python -m unittest test_extract.py
```

## Scrape one job page

Start with the cheapest path:

```bash
python scrape_job.py "https://company.example/jobs/123" --mode http
```

If the content is rendered by JavaScript:

```bash
python scrape_job.py "https://company.example/jobs/123" --mode dynamic
```

For a permitted target where ordinary fetching is blocked, explicitly opt into stealth mode:

```bash
python scrape_job.py "https://company.example/jobs/123" --mode stealth
```

Cloudflare solving is deliberately a separate explicit switch:

```bash
python scrape_job.py "https://company.example/jobs/123" --mode stealth --solve-cloudflare
```

Only scrape pages you are allowed to access, respect site terms and robots policies, and keep request rates conservative.

## Benchmark modes

```bash
python benchmark.py \
  "https://company-a.example/jobs/123" \
  "https://company-b.example/careers/456" \
  --modes http dynamic stealth \
  --runs 3 \
  --cooldown 2 \
  --output results.json
```

Browser modes are much heavier than HTTP mode, so the benchmark defaults to one HTTP run and a one-second cooldown.

## Extraction order

1. Look for Schema.org `JobPosting` JSON-LD.
2. Normalize title, hiring organization, location, description, date, employment type, salary, and apply URL.
3. If structured data is missing, fall back to conservative DOM selectors.
4. Report completeness rather than silently pretending a partial extraction is complete.

## Decision gate before integrating into OfferClaw

Do **not** replace JSearch yet. First collect a representative set of company career pages and compare:

| Metric | Target |
|---|---:|
| Successful fetches | >= 95% on allowed test pages |
| Core-field completeness | >= 0.8 average |
| JSON-LD extraction rate | Track by source |
| HTTP-mode coverage | Maximize before browser fallback |
| Median latency | Track separately by mode |
| Maintenance | Prefer generic structured-data extraction over brittle source selectors |

If Scrapling clears that gate, the next step is a small OfferClaw ingestion service/API that accepts URLs and returns this normalized schema. The browser-only React app should not try to execute Scrapling directly.

## Next experiments

Keep each library in its own sibling directory and make it emit the same benchmark schema. Likely follow-ups: Crawlee, Playwright, Scrapy, Selenium, and a plain HTTP/parser baseline.
