# OfferClaw Browser Worker

Playwright service for **read-only inspection and explicitly approved supervised prefill** of supported application forms.

This service is intentionally separate from the Vite/Vercel web runtime because Chromium is a heavier, higher-risk execution boundary. It has **no final-submit capability**.

## Supported connectors

The first runtime enables only Greenhouse, Lever and Ashby. Other connector contracts remain disabled until their public application pages are tested against the same policy.

## Endpoints

- `GET /health`
- `POST /v1/inspect` — read-only form metadata inspection
- `POST /v1/prefill` — fill an explicit reviewed field set without submitting, then retain a frozen review session
- `POST /v1/session/close` — destroy one retained prefill review session

All POST endpoints require the worker bearer token.

## Inspection security model

Inspection rejects non-HTTPS targets, URL credentials, hostname substring spoofing, non-enabled connectors, prefill/submit actions, scopes other than `inspect_only`, requests that allow writes, and requests that do not mark page content untrusted.

During inspection a fresh browser context is created, downloads/dialogs/service workers/new tabs are suppressed, non-GET/HEAD/OPTIONS requests are blocked, document navigation is constrained to the approved origin, no candidate profile/resume data is sent to the page, and field values/raw HTML are never returned.

## Supervised prefill security model

Prefill accepts only `prefill_application + prefill_only` tasks for Greenhouse, Lever or Ashby with at most 40 explicitly reviewed fields. Approved fields are limited to direct profile-backed identity, contact, location and profile-link values.

Salary, work authorization, screening answers, demographic fields, legal attestations, consent, CAPTCHA, 2FA, file uploads, checkboxes/radios and unknown fields are excluded.

The worker re-inspects every approved live control before writing. The key, label, input type and safe classification must still match; missing, ambiguous, changed, disabled, readonly or newly sensitive fields are rejected.

### Network freeze before candidate values

A form can attach JavaScript listeners that transmit values as soon as an input changes. Therefore the worker does not rely on “we never click submit” as its privacy boundary.

The page first loads under the read-only request policy. After live revalidation and checkpoint detection, the worker freezes all HTTP(S) traffic and prevents WebSocket server connections. Only then are approved candidate values written into the DOM. Final submit is never clicked under `prefill_only`.

The dedicated Chromium regression test includes a form whose email `input` handler attempts to exfiltrate the value; the leak request must never reach the fixture server.

## Retained frozen review sessions

A successful prefill is not discarded immediately. The frozen Playwright context is retained behind a cryptographically random opaque session ID, and the worker captures a 1280×900 PNG viewport preview after the values are filled.

The default retained-session lifetime is 10 minutes, with a hard maximum of 15 minutes. The in-memory store is bounded; when full, the oldest context is destroyed before a new one is retained. Sessions are also destroyed by explicit `/v1/session/close`, expiry, eviction and process shutdown.

The screenshot may contain approved candidate values. It is returned to the active web review UI for display, not written to worker logs or durable OfferClaw storage. Ordinary JSON field-result metadata never echoes candidate values.

The retained session remains network-frozen. A future final-submit protocol must be a separate approval scope and must explicitly define how/when networking is allowed again; it cannot inherit submit authority from prefill.

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
- `BROWSER_WORKER_TOKEN` — required for worker POST endpoints
- `BROWSER_WORKER_MAX_CONCURRENCY` — defaults to `2`, capped at `4`
- `BROWSER_WORKER_INSPECT_TIMEOUT_MS` — defaults to `15000`, capped at `20000`

The web app's `BROWSER_WORKER_URL` should point to this service, and both services must share the same bearer token.
