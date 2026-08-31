# Device-scoped scout cloud store

OfferClaw can optionally copy saved scout goals and compact scout-run history into an Upstash Redis database. This is the first durable server state in the project and is deliberately narrower than the browser's full career data.

## Data that may be stored

Only the normalized scout state is eligible:

- up to 12 saved scout goals
- up to 40 compact run records
- at most 12 compact result summaries per run
- role/query, location, cadence, freshness, match threshold, company exclusions, last-run timestamp
- result title, company, location, URL, match score, age and source metadata

The state normalizer drops unknown keys and does not persist full job descriptions.

## Data that is not uploaded by this feature

- candidate profile
- resume/CV contents or files
- email/phone
- tracker/application history
- generated application packages
- salary/work-authorization preferences outside the saved goal schema
- browser cookies from job boards
- AI prompts or model responses

## Identity isolation

`/api/scout/state` accepts no device ID or Redis key from the browser. The server verifies the signed HttpOnly device cookie and derives:

```text
offerclaw:v1:device:<verified-random-subject>:scout:state
offerclaw:v1:device:<verified-random-subject>:scout:revision
```

Requests without a valid device identity are rejected before Redis is called.

## Write conflict behavior

Writes include an expected revision. The Redis adapter performs a small Lua compare-and-swap over the state and revision keys. A stale writer receives HTTP `409 scout_state_revision_conflict` instead of silently overwriting newer data.

The browser sync client responds to one conflict by reloading, merging goals/runs deterministically, and retrying once. It does not enter an unbounded retry loop.

## User control

Cloud copy is explicit in this release:

- `Enable & sync` creates/refreshes the anonymous device session, merges local and remote scout state, then writes the merged copy.
- `Sync now` repeats that explicit merge/write.
- `Remove cloud copy` deletes the remote scout state while leaving local browser state intact.

Editing or running a scout does not automatically upload data yet.

## Runtime configuration

Required server-only environment variables:

```text
OFFERCLAW_IDENTITY_SECRET=...
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
```

The Redis URL must use HTTPS. Credentials are never returned by `/api/health` or any browser API.

## What this still does not do

This durable copy does not execute a scout while the browser is closed. Background execution needs a scheduler and enough server-side search context to run a useful query. That will be added separately rather than quietly uploading the user's entire local profile as part of this storage PR.
