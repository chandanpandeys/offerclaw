# Browser worker gateway

OfferClaw's web runtime exposes a narrow authenticated gateway to the dedicated Playwright worker. It is **not** a generic browser-control API.

## Endpoints

```text
POST /api/browser/inspect
POST /api/browser/prefill
```

Inspection remains read-only and requires `inspect_form + inspect_only`.

Prefill requires `prefill_application + prefill_only`, an explicit reviewed field set, and a Greenhouse/Lever/Ashby target. Final submission is not exposed by the gateway.

## Server configuration

```text
BROWSER_WORKER_URL=https://dedicated-worker.example
BROWSER_WORKER_TOKEN=...
BROWSER_WORKER_TIMEOUT_MS=20000
```

These variables are server-only and must never use a `VITE_` prefix. The worker URL must use HTTPS. `/api/health` reports capability readiness but never the URL or bearer token.

## Inspection boundary

Before `/api/browser/inspect` forwards anything, OfferClaw verifies the browser-task version, exact action/scope, HTTPS target, connector allowlist, and hostname/connector match. The gateway forwards only to `${BROWSER_WORKER_URL}/v1/inspect`, disables redirects, and sends a policy with page content marked untrusted, writes disabled, and navigation limited to the task origin.

The response is normalized to bounded field metadata and checkpoint flags. Raw HTML, arbitrary page instructions, worker metadata, and field values are discarded.

## Supervised prefill boundary

`/api/browser/prefill` adds a second independent validation layer. It requires:

- same-origin browser request
- `prefill_application`
- `prefill_only`
- Greenhouse, Lever, or Ashby destination
- no more than 40 reviewed fields
- identity/contact/location/profile-link field kinds only
- safe text/email/tel/url/search/textarea/select controls only
- direct `profile.*` evidence for every value

Salary, work authorization, screening answers, file uploads, demographic data, legal declarations, consent, CAPTCHA, 2FA, checkboxes/radios, and unknown controls cannot enter this protocol.

The gateway forwards the approved values only to the fixed `${BROWSER_WORKER_URL}/v1/prefill` endpoint using the server-side bearer token. Candidate values are never written to gateway logs and are removed from the normalized worker response.

The worker policy requires:

```json
{
  "pageContentTrust": "untrusted",
  "domWritesAllowed": true,
  "networkAfterPrefillAllowed": false,
  "submitAllowed": false,
  "navigationScope": "task_origin_only"
}
```

The gateway rejects a successful-looking worker response if it reports a different origin, if network freeze is false, or if submit was attempted.

## Worker-side revalidation

The dedicated worker does not trust the gateway blindly. It validates the task/field contract again, loads the page under the read-only request policy, detects CAPTCHA/2FA/login checkpoints, and re-inspects every approved control.

A live control must still match the approved key, label, type, and safe classification. Changed/missing/ambiguous/disabled/readonly/sensitive controls are rejected.

Before the first candidate value is written, all HTTP(S) traffic is frozen and WebSocket connections are prevented from connecting to their servers. This blocks page JavaScript from transmitting values from `input`/`change` listeners. The worker never clicks submit under the prefill scope.

## Response boundary

The prefill response contains only:

- approved field key
- `filled` / `rejected` status
- kind and input type
- evidence-source reference
- reason code
- counts and policy metadata

It never echoes candidate values.

## Why a dedicated worker

Browser binaries, isolation, egress control, concurrency, and application-page risk are operationally different from the main Vercel Functions runtime. Keeping browser execution behind a narrow authenticated service lets OfferClaw strengthen that boundary independently.

Final application submission remains a separate future protocol and approval decision. LinkedIn write automation remains blocked unless an authorized integration exists.
