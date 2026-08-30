# Security Policy

OfferClaw is a browser-first application. There is currently no OfferClaw backend, account system, or server-side credential store.

## API keys

Optional JSearch/RapidAPI and Gemini keys are stored in the browser's `localStorage` and used by client-side requests to those providers.

Because `localStorage` is accessible to JavaScript running on the same origin, treat these keys as development or user-scoped credentials rather than high-value production secrets.

Recommended practices:

- use provider-side quotas and restrictions where available
- do not reuse keys from sensitive production systems
- rotate a key if you believe it was exposed
- clear site data before using OfferClaw on a shared or public device
- review browser extensions and third-party scripts that can access page content

## Reporting a vulnerability

Please open a GitHub security advisory for vulnerabilities that could expose user data or credentials. Avoid posting exploitable credential leaks in a public issue.

For ordinary bugs that do not expose sensitive data, use a normal GitHub issue.

## Supported version

Security fixes target the latest code on the default branch.
