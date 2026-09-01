# Browser worker gateway

OfferClaw's web runtime exposes a narrow authenticated gateway to the dedicated Playwright worker. It is **not** a generic browser-control API.

## Endpoints

```text
POST   /api/browser/inspect
POST   /api/browser/prefill
POST   /api/browser/submit
DELETE /api/browser/prefill-session
```

Inspection remains read-only and requires `inspect_form + inspect_only`.

Prefill requires `prefill_application + prefill_only`, an explicit reviewed field set, and a Greenhouse/Lever/Ashby target. A successful prefill must return a short-lived retained frozen browser session plus a bounded PNG review preview.

Final submission is a separate `submit_application + submit_once` protocol. `/api/browser/submit` accepts only the short-lived approval record produced from the deterministic readiness gate; it does not accept arbitrary browser actions, form values or destinations.

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

`/api/browser/prefill` requires:

- same-origin browser request
- `prefill_application + prefill_only`
- Greenhouse, Lever, or Ashby destination
- no more than 40 reviewed fields
- identity/contact/location/profile-link field kinds only
- safe text/email/tel/url/search/textarea/select controls only
- direct `profile.*` evidence for every value

Salary, work authorization, screening answers, file uploads, demographic data, legal declarations, consent, CAPTCHA, 2FA, checkboxes/radios, and unknown controls cannot enter this protocol.

The gateway forwards approved values only to the fixed `${BROWSER_WORKER_URL}/v1/prefill` endpoint. Candidate values are removed from normalized result metadata. The worker must report `networkFrozen: true`, `browserOffline: true`, `submitAttempted: false`, a retained session and a bounded PNG preview.

## Submit-once gateway boundary

`/api/browser/submit` is a new mutation boundary and is independently same-origin protected. The request contains only a `submit_once` approval record.

The gateway validates:

- approval schema/version/scope
- `explicit_user_approval`
- supported Greenhouse/Lever/Ashby connector
- connector/URL match
- opaque retained-session capability format
- approval is unconsumed and unexpired
- approval lifetime is no more than five minutes

It then reconstructs the worker task and forwards only to `${BROWSER_WORKER_URL}/v1/submit` with:

```json
{
  "pageContentTrust": "untrusted",
  "navigationScope": "task_origin_only",
  "submitAllowed": true,
  "singleSubmitAttempt": true,
  "browserMustStartOffline": true,
  "networkPolicy": "connector_submission_only"
}
```

The browser-worker bearer token stays server-side. Redirect following at the gateway is disabled.

The worker response is normalized to bounded outcome metadata only. Request bodies, response bodies, form values, raw HTML and arbitrary worker payloads are discarded. If the worker reports that a network submission was attempted but the retained session was not destroyed, the gateway treats that as a policy violation.

## Worker-side revalidation

The dedicated worker validates each protocol again. Before submit it atomically claims the retained session, burns the approval ID, checks connector/URL/session binding, rechecks CAPTCHA/2FA/login state, verifies visible required controls, and selects exactly one deterministic submit control.

Prefill starts from an offline/frozen browser. Submit temporarily re-enables only connector-owned POST/OPTIONS traffic plus first-party document navigation. Third-party requests, ordinary fetch/XHR GETs and WebSockets remain blocked. There is no automatic submit retry.

If candidate data may have left through an application POST or post-click navigation, the session is destroyed regardless of success or uncertainty. If no application request occurs, the worker refreezes the session but the used approval ID cannot be replayed.

See [SUBMIT_ONCE.md](SUBMIT_ONCE.md) for the complete network and outcome model.

## Retained review response

A successful prefill response contains sanitized field result metadata, an opaque session ID/expiry and a bounded `image/png` screenshot preview. The screenshot can contain approved values because its purpose is user review. The browser UI keeps the preview only in component memory; it is not persisted in localStorage, scout Redis state, analytics, or application history.

## Why a dedicated worker

Browser binaries, isolation, egress control, concurrency, retained sessions, and application-page risk are operationally different from the main Vercel Functions runtime. Keeping browser execution behind a narrow authenticated service lets OfferClaw strengthen that boundary independently.

LinkedIn write automation remains blocked unless an authorized integration exists.
