# OfferClaw Browser Worker

Playwright service for **read-only inspection and explicitly approved supervised prefill** of supported application forms.

This service is intentionally separate from the Vite/Vercel web runtime because Chromium is a heavier, higher-risk execution boundary. It still has **no final-submit capability**.

## Supported connectors

The first runtime enables only:

- Greenhouse
- Lever
- Ashby

Other connector contracts remain disabled until their public application pages are tested against the same policy.

## Endpoints

- `GET /health`
- `POST /v1/inspect` — read-only form metadata inspection
- `POST /v1/prefill` — fill an explicit reviewed field set without submitting

Both POST endpoints require the worker bearer token.

## Inspection security model

Inspection rejects:

- non-HTTPS targets
- URLs containing credentials
- hostname substring spoofing
- non-enabled connectors
- prefill or submit actions on the inspection endpoint
- scopes other than `inspect_only`
- requests where `writesAllowed` is not exactly `false`
- requests where page content is not marked untrusted

During inspection:

- a fresh browser context is created for each request
- downloads, dialogs, service workers, and new tabs are suppressed
- all non-GET/HEAD/OPTIONS requests are blocked
- document navigation is constrained to the approved origin
- no candidate profile/resume data is sent to the page
- field values and raw HTML are never returned

## Supervised prefill security model

Prefill accepts only tasks with:

- action `prefill_application`
- approval scope `prefill_only`
- Greenhouse, Lever, or Ashby target origin
- page content marked untrusted
- `domWritesAllowed: true`
- `networkAfterPrefillAllowed: false`
- `submitAllowed: false`
- at most 40 explicitly reviewed approved fields

Approved fields are limited to direct profile-backed identity, contact, location, and profile-link values. Salary, work authorization, screening answers, demographic fields, legal attestations, consent, CAPTCHA, 2FA, file uploads, checkboxes/radios, and unknown fields are excluded from this protocol.

The worker re-inspects every approved field before writing. The live field must still have the same key, label, input type, and safe classification. Missing, ambiguous, changed, disabled, readonly, or newly sensitive fields are rejected rather than filled.

### Network freeze before candidate values

A form can attach JavaScript listeners that transmit values as soon as an input changes. Therefore the worker does **not** rely on “we never click submit” as a privacy boundary.

The page is allowed to load under the read-only request policy. After field revalidation and checkpoint detection, the worker freezes all HTTP(S) requests before the first candidate value is written. WebSocket connections are routed without connecting to their servers. Only then are reviewed values written to the DOM.

The worker never returns approved values in its response and never logs them. It returns only field key/status/kind/evidence-source metadata and counts.

CAPTCHA, 2FA, or login checkpoints abort prefill for the whole task. Final submit is not implemented by `/v1/prefill`.

The main OfferClaw gateway independently validates the task and approved fields before calling the worker, then sanitizes and policy-checks the response again.

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
- `BROWSER_WORKER_TOKEN` — required for `/v1/inspect` and `/v1/prefill`
- `BROWSER_WORKER_MAX_CONCURRENCY` — defaults to `2`, capped at `4`
- `BROWSER_WORKER_INSPECT_TIMEOUT_MS` — defaults to `15000`, capped at `20000`

The web app's `BROWSER_WORKER_URL` should point to this service, and both services must share the same bearer token.
