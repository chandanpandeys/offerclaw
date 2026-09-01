# Security Policy

OfferClaw keeps the user profile and application pipeline local to the browser by default, while third-party provider credentials stay server-side.

## Provider credentials

Production browser code must not contain provider or worker secrets. Server environment variables include:

- `GEMINI_API_KEY` (or `GOOGLE_API_KEY`)
- `GEMINI_MODEL` (optional; defaults to `gemini-3.7-flash`)
- `JSEARCH_API_KEY` (or `RAPIDAPI_KEY`)
- `BROWSER_WORKER_URL`
- `BROWSER_WORKER_TOKEN`
- `OFFERCLAW_IDENTITY_SECRET`
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`
- `CRON_SECRET`

Never prefix secrets with `VITE_`; Vite-prefixed variables are intended for browser exposure.

The application does not ask end users to paste provider keys into Settings or store provider keys in `localStorage`.

## Local user data

The candidate profile and application tracker are stored in browser `localStorage`. Treat a shared browser/device as shared access to that data. Clear site data before handing a device to another person.

Resume text can contain sensitive personal information. OfferClaw sends it to the configured AI provider only when the user asks to prepare an application package. Deployers should review their AI provider's data-processing and retention settings before enabling the AI route.

The optional scout cloud store is deliberately narrower: saved scout goals and compact scout-run evidence only. Profile, resume, tracker and application drafts are not part of the scout-state schema.

## Supervised browser automation

Browser inspection, prefill and submit-once execution run behind a separate authenticated worker. The first live worker allowlist is Greenhouse, Lever and Ashby.

Inspection is read-only. Supervised prefill requires a fresh inspection review and explicit user confirmation. Only direct profile-backed identity/contact/location/profile-link values can enter the prefill protocol; salary, work authorization, screening answers, file uploads, demographic/legal/consent fields, CAPTCHA and 2FA are excluded.

Before approved candidate values are written into the remote DOM, the worker freezes HTTP(S) routing, prevents WebSocket server connections, and switches the Playwright context offline. The `prefill_only` scope still has no submit capability.

A successful prefill creates a short-lived retained browser context and a PNG screenshot preview so the user can review what was filled. The screenshot can contain approved candidate values. It is returned only to active in-memory UI review state; OfferClaw does not persist the preview in `localStorage`, scout Redis state, analytics, or application history. Closing/cancelling the review destroys the retained worker context; abandoned sessions expire automatically and are also destroyed on worker shutdown.

### Final submit boundary

Final submission requires a separate deterministic readiness result and a new short-lived `submit_once` approval. The approval carries no resume/profile/form values and is bound to the exact ATS connector, job URL and retained browser session.

The web gateway and worker validate the approval independently. Approval IDs are one-time capabilities within a retained session; a previously used approval ID cannot be replayed even when a pre-submit validation failure safely returns the browser to its frozen state.

Immediately before submit, the worker checks live required controls, CAPTCHA/2FA/login state, rejected prefill results, URL binding and submit-control ambiguity again.

Only then may the worker temporarily re-enable a connector-scoped network policy. The allowlist is limited to the documented Greenhouse/Lever/Ashby hosted job/application families. The submit window permits connector-owned POST requests, OPTIONS preflight, and first-party top-level document navigation. Ordinary fetch/XHR GETs, third-party analytics, unrelated ATS hosts and WebSockets remain blocked. The worker clicks one submit control exactly once and never automatically retries.

If an application POST or post-click navigation occurs, candidate data is treated as potentially transmitted. The retained browser session is destroyed after bounded outcome capture regardless of success, failure or uncertainty. No request body, response body, candidate field value or raw page HTML is returned or logged.

The frontend stores only a bounded local submission outcome for tracker/audit use: outcome class, confirmation state/signal, connector, final URL, limited request counts/status and timestamp. It never persists the screenshot preview, submit approval ID, retained session capability, form values or raw worker payload.

OfferClaw does not request employer-side Greenhouse/Lever/Ashby API credentials to submit arbitrary candidates. Employer/integration APIs remain separate from the applicant-facing hosted form workflow.

The browser-worker bearer token, worker URL and internal session records are never returned to page JavaScript. The frontend receives only opaque session/approval capabilities required for the explicitly approved action.

## API protections

The AI proxy validates request size, applies a lightweight best-effort per-instance rate limit, uses stateless Gemini interactions (`store: false`), and does not return provider credentials to the client.

State-changing browser/scout endpoints apply same-origin checks where appropriate. Browser targets are validated against explicit connector hostname families, worker redirects are disabled, and worker responses are normalized before being returned to the browser.

For a public high-traffic deployment, add platform-level rate limiting / firewall rules because in-memory limits are not globally durable across function instances.

## Reporting a vulnerability

Please use a GitHub security advisory for vulnerabilities that could expose user data, provider credentials, retained browser sessions, submit approvals, or enable abusive provider usage. Avoid posting exploitable credential leaks in a public issue.

For ordinary non-sensitive bugs, use a normal GitHub issue.

## Supported version

Security fixes target the latest code on the default branch.