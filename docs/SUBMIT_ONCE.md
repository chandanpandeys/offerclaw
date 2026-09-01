# Submit-once boundary

OfferClaw does not treat a successful prefill as permission to submit an application.

`src/submitReadiness.js` defines the deterministic gate that must pass before OfferClaw may even ask the user for a final-submit approval.

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

Optional unresolved fields do not automatically block the gate unless the application marks them required.

## Approval record

Only a clean readiness result can produce an approval record. The record:

- has scope `submit_once`
- records `explicit_user_approval`
- is bound to the exact job URL, connector and retained browser session
- expires after at most five minutes and never later than the retained browser session
- carries no profile, resume, form answers or candidate values
- starts unconsumed

This record is not an executor. It is the prerequisite for a future submit API/worker protocol.

## Future executor requirements

A future submit executor must still revalidate the retained session and form immediately before action. It must use connector-specific network/destination rules, consume the approval exactly once, capture the resulting application outcome, and close the browser session after success/failure.

The executor must not inherit broad network access merely because the prefill session existed. Re-enabling network for final submission is a new security transition that needs connector-specific validation and tests.

LinkedIn and other platforms where automated write activity is restricted remain outside this ATS submit protocol unless an authorized integration exists.
