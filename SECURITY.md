# Security Policy

OfferClaw keeps the user profile and application pipeline local to the browser, while third-party provider credentials stay server-side.

## Provider credentials

Production browser code must not contain Gemini or RapidAPI/JSearch secrets. The Vercel Functions under `api/` read credentials from server environment variables:

- `GEMINI_API_KEY` (or `GOOGLE_API_KEY`)
- `GEMINI_MODEL` (optional; defaults to `gemini-3.7-flash`)
- `JSEARCH_API_KEY` (or `RAPIDAPI_KEY`)

Never prefix these secrets with `VITE_`; Vite-prefixed variables are intended for browser exposure.

The application no longer asks end users to paste API keys into Settings or stores provider keys in `localStorage`.

## Local user data

The candidate profile and application tracker are stored in browser `localStorage`. Treat a shared browser/device as shared access to that data. Clear site data before handing a device to another person.

Resume text can contain sensitive personal information. OfferClaw only sends it to the configured AI provider when the user asks to prepare an application package. Deployers should review their AI provider's data-processing and retention settings before enabling the AI route.

## API protections

The AI proxy validates request size, applies a lightweight best-effort per-instance rate limit, uses stateless Gemini interactions (`store: false`), and does not return provider credentials to the client.

For a public high-traffic deployment, add platform-level rate limiting / firewall rules because in-memory limits are not globally durable across function instances.

## Reporting a vulnerability

Please use a GitHub security advisory for vulnerabilities that could expose user data, provider credentials, or enable abusive provider usage. Avoid posting exploitable credential leaks in a public issue.

For ordinary non-sensitive bugs, use a normal GitHub issue.

## Supported version

Security fixes target the latest code on the default branch.
