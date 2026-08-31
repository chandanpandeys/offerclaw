# Browser worker gateway

OfferClaw's web runtime now defines a narrow gateway for a future dedicated browser worker.

The gateway is intentionally **inspection-only**. It does not expose a generic browser-control endpoint and it does not prefill or submit application forms.

## Endpoint

```text
POST /api/browser/inspect
```

The endpoint accepts one validated OfferClaw browser task whose action is exactly `inspect_form` and whose approval scope is exactly `inspect_only`.

Any prefill or submit task is rejected before a remote worker is called.

## Server configuration

```text
BROWSER_WORKER_URL=https://dedicated-worker.example
BROWSER_WORKER_TOKEN=...
BROWSER_WORKER_TIMEOUT_MS=20000
```

These variables are server-only and must never use a `VITE_` prefix.

The worker URL must be HTTPS. `/api/health` reports only whether the worker is configured and that the current mode is `inspection_only`; it never exposes the worker URL or bearer token.

## Request boundary

Before forwarding a request, OfferClaw verifies:

- supported browser-task version
- action is `inspect_form`
- approval scope is `inspect_only`
- target is HTTPS
- connector is in the explicit ATS browser allowlist
- declared connector matches the target hostname

Generic `employer_site` targets are **not** in the first worker allowlist. OfferClaw labels unknown non-board domains as likely employer routes for source intelligence, but that heuristic is not strong enough to grant a remote browser access to an arbitrary origin.

A future employer-site worker path needs an explicit verified-domain mechanism.

## Worker call security

The gateway forwards to only:

```text
${BROWSER_WORKER_URL}/v1/inspect
```

and attaches the bearer token server-side.

Outbound redirects are disabled. This prevents a compromised/misconfigured worker endpoint from redirecting an authenticated request to another origin.

The forwarded policy says:

```json
{
  "pageContentTrust": "untrusted",
  "writesAllowed": false,
  "navigationScope": "task_origin_only"
}
```

If the worker reports that inspection ended on a different origin than the approved job URL, OfferClaw rejects the result.

## Response boundary

The gateway does not forward arbitrary worker output to the frontend.

It keeps only bounded form metadata:

- URL/title/connector ID
- field ID/name/label/type/placeholder/autocomplete
- required/disabled/readonly flags
- bounded select options
- CAPTCHA / 2FA / login checkpoint flags
- field count, inspection timestamp and worker version

Raw HTML, screenshots encoded as data, script content, arbitrary page instructions, model prompts, worker secrets and unknown metadata keys are discarded.

The returned object is always marked:

```text
pageContentTrust: untrusted
```

The local form planner can then convert these discovered controls into `prefill`, `review`, `manual`, or `unresolved` decisions using candidate evidence already stored in the user's browser.

## Intended worker implementation

The dedicated worker should begin with deterministic Playwright inspection:

1. navigate only to the approved task URL
2. stay on the approved origin
3. detect application form controls using DOM/accessibility metadata
4. return normalized field metadata
5. make no form writes
6. surface CAPTCHA/login/2FA checkpoints
7. close/expire the session after a short bounded lifetime

An AI recovery layer can later help with unusual layouts, but page content cannot alter the task policy.

## Why a dedicated worker

Browser sessions are operationally different from the main Vercel API:

- browser binaries are large
- sessions can be longer-lived
- isolation and egress controls matter
- CAPTCHA/auth checkpoints require resumable sessions
- concurrency and resource limits should be managed independently

Keeping this behind a narrow authenticated gateway lets OfferClaw use a managed browser provider, isolated container service, or self-hosted worker later without exposing browser-control credentials to the web client.

## Next step

Implement a minimal worker service whose only route is `POST /v1/inspect`, then validate it against controlled Greenhouse/Lever/Ashby test pages before enabling any real user workflow.
