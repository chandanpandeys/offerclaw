# Browser worker contract

OfferClaw's browser worker is an **approval-scoped executor**, not a general-purpose autonomous browser.

## Design goals

1. Deterministic browser automation first.
2. Page content is untrusted data, never policy or agent instructions.
3. Connector and destination must agree before browser access is allowed.
4. Inspection, prefill, and final submission are separate approval scopes.
5. Candidate data is filled only from explicit evidence.
6. CAPTCHA, 2FA, legal attestations, consent, sensitive demographic fields, screening answers, salary/work authorization, and file uploads stay outside automatic prefill.
7. Final submission is never implied by permission to inspect or prefill.

## Task contract

`src/browserTasks.js` defines the browser task envelope. `inspect_only`, `prefill_only`, and `submit_once` remain separate scopes; only the first two currently have implementations.

A broad scope cannot make a blocked connector writable. Connector policy remains the outer boundary.

## Connector boundary

The general browser-task model knows about several ATS families, but the **live Playwright worker currently enables only Greenhouse, Lever and Ashby**. LinkedIn, unknown destinations, demo data, generic `employer_site` routes and untested ATS families are not live worker targets.

The generic employer-site exclusion is intentional: a heuristic source label is not strong enough evidence to grant remote browser access to an arbitrary origin.

## Form planning

`src/formPlanner.js` converts inspected controls into `prefill`, `review`, `manual`, or `unresolved` decisions. `src/prefillContract.js` narrows that again for the worker.

Automatic prefill currently accepts only direct profile-backed:

- name
- email
- phone
- location/address text
- LinkedIn URL
- GitHub URL
- portfolio/website URL

Salary, work authorization, screening answers, resume attachments, unknown controls, demographics, legal declarations, consent, CAPTCHA and 2FA do not enter the safe prefill protocol.

## Prompt-injection boundary

A job page, hidden DOM element, accessibility label, tooltip or page script can contain hostile instructions. Page content may help identify labels/options/layout but may not change autonomy mode, widen approval scope, add connectors, reveal secrets, authorize submission, override evidence rules, or remove manual checkpoints.

## Shipped execution architecture

```text
Selected ATS job
   |
   v
Read-only inspection
   |
   v
Local evidence-bound form plan
   |
   v
Explicit user prefill confirmation
   |
   v
Worker live-field revalidation
   |
   v
Freeze HTTP(S) + WebSocket egress
   |
   v
Write approved direct-profile fields
   |
   v
Retain frozen context + PNG preview
   |
   v
User review / cancel / TTL expiry
```

The worker never clicks final submit under `prefill_only`.

## Retained review sessions

Prefill is useful only if the result can be reviewed. A successful prefill therefore retains the frozen Playwright context behind a random opaque capability and returns a PNG screenshot preview. The default lifetime is 10 minutes and the hard maximum is 15 minutes. The in-memory session store is bounded and destroys sessions on explicit cancel, expiry, eviction and worker shutdown.

The screenshot may contain approved candidate values, so it is treated as short-lived sensitive review data. The frontend keeps it only in component memory and does not persist it to localStorage, Redis, analytics, or tracker history.

A retained session remains fully network-frozen. Any future final-submit protocol must be a new explicit approval and must define its own narrowly scoped network transition; prefill authority alone can never submit.

## Current runtime

- `services/browser-worker/` — Playwright/Chromium service
- `POST /v1/inspect` — read-only field inspection
- `POST /v1/prefill` — approved network-frozen prefill + retained review session
- `POST /v1/session/close` — explicit retained-session destruction
- `api/browser/inspect.js` — same-origin web inspection gateway
- `api/browser/prefill.js` — same-origin supervised prefill gateway
- `api/browser/prefill-session.js` — same-origin cancellation gateway
- `src/SupervisedPrefillCenter.jsx` — selected-job inspection/prefill review surface

The dedicated worker remains isolated from the Vite/Vercel runtime and uses a server-side bearer token.

## Next boundary

The next browser-action milestone is **not more aggressive prefill**. It is a separately designed `submit_once` protocol with an approval record, a revalidation step, exact destination/form evidence, controlled network re-enable, outcome capture, and hard blocks for unresolved/manual fields. It should not be enabled for LinkedIn or other restricted platforms without an authorized integration.
