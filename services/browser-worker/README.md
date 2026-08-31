# OfferClaw Browser Worker

Inspection-only Playwright service for OfferClaw application forms.

This service is intentionally separate from the Vite/Vercel web runtime because Chromium is a heavier, higher-risk execution boundary. It does not fill or submit forms.

## Supported connectors

The first runtime enables only:

- Greenhouse
- Lever
- Ashby

Other connector contracts remain disabled until their public application pages are tested against the same no-write policy.

## Security model

`POST /v1/inspect` requires a bearer token and accepts only the versioned OfferClaw inspection envelope.

The worker rejects:

- non-HTTPS targets
- URLs containing credentials
- hostname substring spoofing
- non-enabled connectors
- prefill or submit actions
- scopes other than `inspect_only`
- requests where `writesAllowed` is not exactly `false`
- requests where page content is not marked untrusted

During inspection:

- a fresh browser context is created for each request
- downloads, dialogs, service workers, and new tabs are suppressed
- all non-GET/HEAD/OPTIONS requests are blocked
- top-level/subframe document navigation is constrained to the approved origin
- no candidate profile/resume data is sent to the page
- field **values are never returned**
- raw HTML is never returned

The main OfferClaw gateway independently validates and sanitizes the response again.

## Local run

```bash
cd services/browser-worker
npm install
npx playwright install --with-deps chromium
BROWSER_WORKER_TOKEN='replace-with-a-long-random-token' npm start
```

Health check:

```bash
curl http://localhost:8787/health
```

## Container

Build from the repository root because the worker image includes shared OfferClaw policy code:

```bash
docker build -f services/browser-worker/Dockerfile -t offerclaw-browser-worker .
docker run --rm -p 8787:8787 \
  -e BROWSER_WORKER_TOKEN='replace-with-a-long-random-token' \
  offerclaw-browser-worker
```

For production, run the container as an isolated service with outbound network controls, CPU/memory limits, a non-root runtime user, and a secret manager for `BROWSER_WORKER_TOKEN`.

## Environment

- `PORT` — defaults to `8787`
- `BROWSER_WORKER_TOKEN` — required for `/v1/inspect`
- `BROWSER_WORKER_MAX_CONCURRENCY` — defaults to `2`, capped at `4`
- `BROWSER_WORKER_INSPECT_TIMEOUT_MS` — defaults to `15000`, capped at `20000`

The web app's `BROWSER_WORKER_URL` should point to this service, and both services must share the same bearer token.
