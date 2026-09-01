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
8. A final submission may occur only through one short-lived explicit `submit_once` approval and a retained session that passes fresh worker-side checks.

## Task contract

`src/browserTasks.js` defines the browser task envelope. `inspect_only`, `prefill_only`, and `submit_once` remain separate scopes. All three now have implementations for the first live worker connectors, but each has a distinct endpoint and validation layer.

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
Freeze HTTP(S) + WebSocket egress + Playwright offline
   |
   v
Write approved direct-profile fields
   |
   v
Retain frozen context + PNG preview
   |
   v
Deterministic submit readiness
   |
   v
Fresh explicit submit_once approval
   |
   v
Atomic worker session claim + live form recheck
   |
   v
Connector-scoped network transition
   |
   v
One submit click, no retry
   |
   v
Outcome capture + session destruction on attempt
```

The worker never clicks final submit under `prefill_only`. Submission is only reachable through `submit_once`.

## Retained review sessions

Prefill is useful only if the result can be reviewed. A successful prefill therefore retains the frozen Playwright context behind a random opaque capability and returns a PNG screenshot preview. The default lifetime is 10 minutes and the hard maximum is 15 minutes. The in-memory session store is bounded and destroys sessions on explicit cancel, expiry, eviction, attempted final submission and worker shutdown.

The screenshot may contain approved candidate values, so it is treated as short-lived sensitive review data. The frontend keeps it only in component memory and does not persist it to localStorage, Redis, analytics, or tracker history.

The session store also tracks one-time approval IDs. If a submit request fails before any application network request, the page is switched offline/frozen again and the session can remain, but the used approval ID cannot be replayed. Once a POST or post-click navigation occurs, the session is closed after outcome capture.

## Submit-once network boundary

Final submission re-enables networking only after the approval/session/form checks pass. `services/browser-worker/submitPolicy.js` limits traffic to connector-owned ATS hosts and allows only:

- bounded POST requests
- OPTIONS preflight
- top-level GET/HEAD document navigation

Ordinary fetch/XHR GETs, unrelated ATS hosts, third-party analytics and WebSockets remain blocked. There is no automatic retry.

The first allowlist covers Greenhouse hosted board/API hosts, Lever global/EU hosted job/API hosts, and Ashby hosted job/API hosts. See [SUBMIT_ONCE.md](SUBMIT_ONCE.md) for the exact host list and outcome classes.

## Current runtime

- `services/browser-worker/` — Playwright/Chromium service
- `POST /v1/inspect` — read-only field inspection
- `POST /v1/prefill` — approved network-frozen prefill + retained review session
- `POST /v1/submit` — one-shot retained-session submission
- `POST /v1/session/close` — explicit retained-session destruction
- `api/browser/inspect.js` — same-origin web inspection gateway
- `api/browser/prefill.js` — same-origin supervised prefill gateway
- `api/browser/submit.js` — same-origin submit-once gateway
- `api/browser/prefill-session.js` — same-origin cancellation gateway
- `src/SupervisedPrefillCenter.jsx` — selected-job inspection/prefill review surface
- `src/submitReadiness.js` — deterministic final-submit readiness gate
- `src/submitProtocol.js` — shared approval validation

The dedicated worker remains isolated from the Vite/Vercel runtime and uses a server-side bearer token.

## Next boundary

The submit executor is intentionally not a license to broaden automation. The next product step is to surface the final action in the supervised review UI with a clear readiness summary and explicit confirmation, then record bounded local application outcome evidence. Expansion to additional ATS families requires separate real-page tests and connector-specific network policies. LinkedIn or other restricted platforms remain outside this protocol without an authorized integration.
