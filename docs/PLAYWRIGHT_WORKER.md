# Playwright inspection worker

OfferClaw now has a concrete inspection-only browser service under `services/browser-worker`.

The service is intentionally separate from the Vite/Vercel application runtime. It runs Chromium through Playwright `1.62.1` and exposes only:

- `GET /health`
- `POST /v1/inspect`

The main app never receives Playwright/CDP/browser-control credentials.

## Current capability

The worker can inspect public application forms for Greenhouse, Lever, and Ashby URLs that pass strict hostname validation. It extracts labels and control metadata for the existing OfferClaw form planner.

It does **not**:

- log into job platforms
- use a candidate's browser cookies
- fill fields
- upload resumes
- click submit
- solve CAPTCHA or 2FA
- return field values or raw HTML

## Read-only network enforcement

Inspection blocks all page requests whose HTTP method is not `GET`, `HEAD`, or `OPTIONS`. Cross-origin document navigation is also blocked. Third-party read-only assets may load so public forms can render, but page content remains untrusted.

This deliberately favors safety over coverage. If a provider requires POST/GraphQL calls merely to render its public form, that connector stays unsupported until a more precise read-only network policy is designed and tested.

## Isolation

Each request receives a fresh browser context with no persisted cookies or storage. Downloads, dialogs, service workers, and popups are suppressed. The Chromium process may be reused between requests, but browser contexts are not.

The Docker image runs as the non-root `node` user after browser/system dependencies are installed.

## Deployment

Build from repository root:

```bash
docker build -f services/browser-worker/Dockerfile -t offerclaw-browser-worker .
```

Deploy the container to an isolated container runtime. Configure a long random `BROWSER_WORKER_TOKEN` in both the worker and the OfferClaw web project, and configure `BROWSER_WORKER_URL` only in the web project's server environment.

The worker should ideally run with:

- outbound egress controls
- CPU/memory/time limits
- read-only filesystem where practical
- no candidate secrets beyond the inspection task
- centralized runtime logs without page/resume content

## Promotion gate

Prefill must remain disabled until real inspection benchmarks show that:

1. target-origin enforcement works on representative ATS pages
2. field extraction is stable enough to produce useful review plans
3. no candidate data or current form values are returned
4. CAPTCHA/2FA/login checkpoints are correctly surfaced
5. network blocking does not silently create misleading/incomplete plans

Final submission remains a separate approval capability even after prefill is introduced.
