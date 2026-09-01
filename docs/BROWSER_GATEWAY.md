# Browser worker gateway

OfferClaw's web runtime exposes a narrow authenticated gateway to the dedicated Playwright worker. It is **not** a generic browser-control API.

## Endpoints

```text
POST   /api/browser/inspect
POST   /api/browser/prefill
DELETE /api/browser/prefill-session
```

Inspection remains read-only and requires `inspect_form + inspect_only`.

Prefill requires `prefill_application + prefill_only`, an explicit reviewed field set, and a Greenhouse/Lever/Ashby target. A successful prefill must also return a short-lived retained frozen browser session plus a bounded PNG review preview. Final submission is not exposed by the gateway.

`DELETE /api/browser/prefill-session` destroys the retained worker context behind one opaque session capability. It is same-origin protected and never exposes the worker bearer token.

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

The gateway forwards approved values only to the fixed `${BROWSER_WORKER_URL}/v1/prefill` endpoint using the server-side bearer token. Candidate values are never written to gateway logs and are removed from ordinary normalized worker field metadata.

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

The gateway rejects a successful-looking response if it reports a different origin, if network freeze is false, if submit was attempted, or if the retained review session/PNG preview is missing.

## Worker-side revalidation

The dedicated worker validates the task/field contract again, loads the page under the read-only request policy, detects CAPTCHA/2FA/login checkpoints, and re-inspects every approved control.

A live control must still match the approved key, label, type, and safe classification. Changed/missing/ambiguous/disabled/readonly/sensitive controls are rejected.

Before the first candidate value is written, all HTTP(S) traffic is frozen and WebSocket server connections are prevented. This blocks page JavaScript from transmitting values from `input`/`change` listeners. The worker never clicks submit under the prefill scope.

## Retained review response

A successful prefill response contains:

- sanitized field result metadata with no candidate values
- `networkFrozen: true`
- `submitAttempted: false`
- a random opaque session ID and expiry
- a bounded `image/png` screenshot preview captured after prefill

The screenshot can contain the approved values because its purpose is user review. The browser UI keeps that preview only in component memory; it is not persisted in localStorage, scout Redis state, analytics, or application history.

The session ID is an opaque capability, not a user identity or worker credential. The web cancellation endpoint validates its shape, forwards it only to the fixed worker close endpoint with the server bearer token, and treats an already-expired worker session as safely gone.

## Why a dedicated worker

Browser binaries, isolation, egress control, concurrency, retained sessions, and application-page risk are operationally different from the main Vercel Functions runtime. Keeping browser execution behind a narrow authenticated service lets OfferClaw strengthen that boundary independently.

Final application submission remains a separate future protocol and approval decision. LinkedIn write automation remains blocked unless an authorized integration exists.
