# Daily background scout discovery

OfferClaw can run the first truly background scout while the browser is closed, but this layer is intentionally **discovery-only**.

The server has a synced scout goal's role/query, location, freshness window, cadence, and max-result bound. It does **not** have the user's local profile, skills, resume, application tracker, generated drafts, salary preference, or work-authorization evidence. Therefore a server cron result must never be presented as a personalized match score.

## Schedule

`vercel.json` registers one production cron:

```text
/api/cron/scout
0 3 * * *
```

That is one daily invocation at 03:00 UTC. The endpoint accepts only `GET` and requires Vercel's `Authorization: Bearer <CRON_SECRET>` header.

Background `daily` cadence means **at most one successful discovery per UTC calendar day**, not “exactly 24 hours after the previous run.” After any successful run, the next background due time becomes 00:00 UTC on the following day. This keeps the fixed 03:00 UTC production cron reliable even if the user manually runs the same scout late in the previous day. A manual run before that day's cron counts as that day's run, so the 03:00 invocation will not duplicate it.

The interactive Scout Center due indicator remains a rolling 24-hour convenience signal; only the server scheduler uses the UTC-calendar-day rule.

`CRON_SECRET` must be configured server-side and is never returned by the health endpoint.

## How a device becomes scheduled

A device is not enrolled just because a local goal says `daily`.

1. The user explicitly syncs Scout Center cloud state.
2. `/api/scout/state` verifies the HttpOnly anonymous device cookie.
3. The server normalizes the state and finds the earliest enabled daily goal due time.
4. The same Redis Lua transaction that writes state/revision adds or removes the random device namespace in the global sorted schedule index.
5. Unsynced local edits do not change the server schedule.

The schedule index stores only random device namespaces and due timestamps. It does not contain role names, locations, companies, email addresses, or candidate profile data.

## Cron work bounds

Each invocation is intentionally bounded:

- at most 10 due device namespaces
- at most 3 due daily goals per device
- device processing concurrency of 2
- the existing bounded job-source result limits

Invalid/missing state entries are removed from the schedule index. A CAS conflict is not overwritten.

## Discovery sources

Background discovery reuses the configured server job-source contracts:

- JSearch when configured
- configured public Greenhouse feeds
- configured public Lever feeds
- configured public Ashby feeds

Only the scout goal's role/query, location and freshness are used for discovery.

## Stored background result shape

A successful background run is tagged:

```text
mode: background_discovery
personalized: false
```

Each compact result may retain:

- job ID
- title
- company
- location
- application URL
- posting age
- provider/source

`matchScore` is forced to `null`. Full job descriptions are not persisted by the scout-state schema.

When the user returns to a previously linked browser and opens Scout Center, OfferClaw performs a **read-only** cloud refresh. The GET response is merged into local scout state, newly arrived background runs are marked unread only in local browser storage, and the Scout Center shows them in a background inbox. This refresh does not create a device session, does not write Redis state, and does not upload local edits.

The user can also choose `Refresh inbox` to repeat the same GET-only pull. `Sync now` remains the explicit write operation that uploads the current normalized scout state.

Unread/read markers are never stored in Redis. They are local UI state so the background service does not learn what the user opened or reviewed.

Background discoveries are shown as **candidates**, not matches. Personalized evaluation can happen later in the browser where the local candidate profile is available.

## What the cron never does

The cron does not:

- upload or read the local resume/profile
- generate application content
- inspect application forms
- fill fields
- submit applications
- contact recruiters
- solve CAPTCHA/2FA
- assign personalized match scores

Those remain separate capabilities with their existing review/approval boundaries.

## Logging and response privacy

The cron response contains counts/status metadata only. It does not return device namespaces, queries, companies, or discovered job titles. Top-level error logging records only an error name.

## Current delivery model

Background discoveries are persisted and surfaced in the in-app Scout Center inbox when a linked browser returns. OfferClaw still does not send email, push, SMS, Slack, or other out-of-band notifications in this layer.
