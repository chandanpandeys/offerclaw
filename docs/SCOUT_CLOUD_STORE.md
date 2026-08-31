# Device-scoped scout cloud store

OfferClaw can optionally copy saved scout goals and compact scout-run history into an Upstash Redis database. This is the first durable server state in the project and is deliberately narrower than the browser's full career data.

## Data that may be stored

Only the normalized scout state is eligible:

- up to 12 saved scout goals
- up to 40 compact run records
- at most 12 compact result summaries per run
- role/query, location, cadence, freshness, match threshold, company exclusions, last-run timestamp
- result title, company, location, URL, match score/absence of score, age and source metadata

The state normalizer drops unknown keys and does not persist full job descriptions. Background discovery records force personalized `matchScore` to `null`.

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

Writes include an expected revision. The Redis adapter performs a small Lua compare-and-swap over state, revision, and the optional schedule-index update. A stale writer receives HTTP `409 scout_state_revision_conflict` instead of silently overwriting newer data.

The browser sync client responds to one conflict by reloading, merging goals/runs deterministically, and retrying once. It does not enter an unbounded retry loop.

## Daily schedule registration

When an explicitly synced state contains an enabled daily goal, the same successful Redis transaction also registers the random device namespace in the global sorted schedule index at the earliest due timestamp.

When the synced state has no enabled daily goals, that transaction removes the namespace from the index. Removing the cloud copy also removes its schedule entry.

The global index stores random device namespaces and due timestamps only. It does not contain the goal query/location or personal profile data.

## User control

Cloud copy remains explicit:

- `Enable & sync` creates/refreshes the anonymous device session, merges local and remote scout state, writes the merged copy, and registers eligible daily goals for background discovery.
- `Sync now` repeats that explicit merge/write and schedule update.
- `Remove cloud copy` deletes the remote scout state and schedule entry while leaving local browser state intact.

Unsynced local edits remain local and do not change what the daily background worker sees.

## Runtime configuration

Required server-only environment variables for persistence:

```text
OFFERCLAW_IDENTITY_SECRET=...
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
```

Background daily execution additionally requires:

```text
CRON_SECRET=...
```

and at least one configured server job source.

The Redis URL must use HTTPS. Credentials are never returned by `/api/health` or any browser API.

## Background execution boundary

The daily scheduler can use the synced goal's role/query, location, freshness and result limits to discover fresh candidates while the browser is closed. It cannot perform personal match scoring because candidate skills/profile remain local.

See [Daily background scout discovery](BACKGROUND_SCOUT.md) for the cron and discovery contract.
