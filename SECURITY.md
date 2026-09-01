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

Browser inspection and prefill run behind a separate authenticated worker. The first live worker allowlist is Greenhouse, Lever and Ashby.

Inspection is read-only. Supervised prefill requires a fresh inspection review and explicit user confirmation. Only direct profile-backed identity/contact/location/profile-link values can enter the prefill protocol; salary, work authorization, screening answers, file uploads, demographic/legal/consent fields, CAPTCHA and 2FA are excluded.

Before approved candidate values are written into the remote DOM, the Playwright context freezes HTTP(S) traffic and prevents WebSocket server connections. The `prefill_only` protocol has no submit capability.

A successful prefill creates a short-lived retained browser context and a PNG screenshot preview so the user can review what was filled. The screenshot can contain the approved candidate values. It is returned only to the active in-memory UI review state; OfferClaw does not persist the preview in `localStorage`, scout Redis state, analytics, or application history. Closing/cancelling the review destroys the retained worker context; abandoned sessions expire automatically and are also destroyed on worker shutdown.

The browser-worker bearer token, worker URL and internal session records are never returned to page JavaScript. The frontend receives only an opaque random session capability required to cancel its own retained review session.

## API protections

The AI proxy validates request size, applies a lightweight best-effort per-instance rate limit, uses stateless Gemini interactions (`store: false`), and does not return provider credentials to the client.

State-changing browser/scout endpoints apply same-origin checks where appropriate. Browser targets are validated against explicit connector hostname families, worker redirects are disabled, and worker responses are normalized before being returned to the browser.

For a public high-traffic deployment, add platform-level rate limiting / firewall rules because in-memory limits are not globally durable across function instances.

## Reporting a vulnerability

Please use a GitHub security advisory for vulnerabilities that could expose user data, provider credentials, retained browser sessions, or enable abusive provider usage. Avoid posting exploitable credential leaks in a public issue.

For ordinary non-sensitive bugs, use a normal GitHub issue.

## Supported version

Security fixes target the latest code on the default branch.
