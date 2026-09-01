# Submit-once boundary

OfferClaw does not treat a successful prefill as permission to submit an application.

`src/submitReadiness.js` defines the deterministic gate that must pass before OfferClaw may ask the user for final-submit approval. `src/submitProtocol.js`, `api/browser/submit.js`, and the dedicated browser worker independently validate and execute that approval.

## Readiness requirements

A submission is not ready when any of the following is true:

- the destination is not a currently supported Greenhouse, Lever or Ashby route
- selected job, inspection review and retained prefill disagree about job/connector/URL
- CAPTCHA, 2FA or login checkpoint was detected
- the retained prefill session is missing or expired
- the retained browser is not still network-frozen and offline
- a previous submit attempt is already recorded
- a required field is still `review`, `manual` or `unresolved`
- a required `prefill` field was not actually filled in the live browser
- any approved prefill was rejected during live-field revalidation

Optional unresolved fields do not automatically block the client readiness gate unless the application marks them required. The worker performs another live required-control check immediately before submission.

## Approval record

Only a clean readiness result can produce an approval record. The record:

- has scope `submit_once`
- records `explicit_user_approval`
- is bound to the exact job URL, connector and retained browser session
- expires after at most five minutes and never later than the retained browser session
- carries no profile, resume, form answers or candidate values
- starts unconsumed

The web gateway and worker validate this record independently. A used approval ID is retained in the session's bounded replay set even if a pre-submit validation failure safely returns the browser to its frozen state.

## Why the hosted application form is the executor

Greenhouse, Lever and Ashby expose application APIs for employers/custom careers integrations, but their write endpoints require employer or integration credentials. OfferClaw must not request or impersonate those credentials for arbitrary employers.

The submit-once executor therefore continues the applicant-facing hosted ATS form that was already inspected and explicitly prefilled. It never substitutes an employer API credential.

## Network transition

Prefill leaves Chromium both route-frozen and Playwright-offline. Final submission is a separate transition.

After a valid approval and a fresh worker-side form check, the worker temporarily enables only connector-owned submission traffic:

| Connector | Allowed submit hosts |
|---|---|
| Greenhouse | `boards.greenhouse.io`, `job-boards.greenhouse.io`, `boards-api.greenhouse.io` |
| Lever | `jobs.lever.co`, `api.lever.co`, `jobs.eu.lever.co`, `api.eu.lever.co` |
| Ashby | `jobs.ashbyhq.com`, `api.ashbyhq.com` |

Within those hosts the submit window permits:

- `POST` requests, capped per one-shot session
- `OPTIONS` preflight requests
- `GET` / `HEAD` only when they are top-level document navigation, such as a confirmation redirect

Ordinary fetch/XHR GETs, third-party analytics, WebSockets, unrelated ATS hosts and arbitrary redirects remain blocked. The browser is frozen again immediately after the short settle window.

## One-shot execution

Immediately before the click the worker re-checks:

- retained session exists, is unexpired and still frozen/offline
- connector and URL still match
- approval ID has not been used
- no previously rejected prefill remains
- no CAPTCHA, 2FA or login checkpoint appeared
- no visible required live control is empty
- exactly one deterministic submit control can be selected

The worker clicks exactly once and never automatically retries.

If no application POST or document navigation occurs, the worker refreezes the session and returns a non-attempt outcome. The approval ID remains burned; a fresh user approval is required to try again.

If an application POST or post-click navigation occurs, OfferClaw treats candidate data as potentially transmitted. The retained session is destroyed after outcome capture regardless of success, failure or uncertainty. Replaying the approval or session therefore fails closed.

## Outcome classes

The worker returns bounded metadata only:

- `submitted_confirmed` — confirmation signal observed after an attempt
- `submitted_likely` — successful POST response observed without a strong UI confirmation signal
- `attempted_unconfirmed` — network attempt occurred but outcome could not be confirmed
- `attempted_failed` — application POST returned an error status
- `blocked_pre_submit` — live safety/readiness check failed before network was enabled
- `not_attempted` / `submit_control_failed` — no application request was observed

No request body, candidate field value, response HTML or ATS response body is returned or logged.

## Platform boundary

LinkedIn and other platforms where automated write activity is restricted remain outside this ATS submit protocol unless an authorized integration exists.
