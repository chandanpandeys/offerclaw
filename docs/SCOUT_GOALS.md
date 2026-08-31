# Persistent scout goals

OfferClaw scout goals turn repeated job searching into reusable agent state.

## Current state

The browser stores up to 12 scout goals and 40 compact run records in local storage. A goal contains:

- target role / keywords
- location
- freshness window
- minimum match threshold
- maximum results
- excluded companies
- whether already-applied roles should be excluded
- manual or daily cadence preference
- last-run timestamp

Run records keep compact result evidence (title, company, URL, match, freshness, source) rather than copying full job descriptions into history.

## What daily means today

`daily` is currently a **cadence preference and due-state**, not a claim that the browser runs while closed.

The Scout Center marks daily goals due based on the last successful run. The user can run a due scout with one click. This is useful immediately and gives a stable schema for a later scheduler.

## Why cloud scheduling is not enabled yet

OfferClaw currently has no account/authentication layer. Writing personal career goals into a shared server-side Redis/Postgres namespace before there is an authenticated user boundary would risk cross-user data exposure.

The correct order is:

1. stable scout goal/run schema
2. account or cryptographically isolated user/device identity
3. durable server-side state
4. scheduled read-only scouting
5. notifications/digests

Only then should a cron or queue execute saved goals while the browser is closed.

## Future durable store

A serverless Redis/Postgres adapter can implement the same goal/run model without changing the UI. On Vercel, current storage integrations include Upstash Redis and other Marketplace databases. Any provider adapter must remain server-side and namespace all records by an authenticated identity.

## Scheduler policy

Background scouting is a read-only agent action. It may search, normalize, rank, deduplicate, and verify listings.

It must not imply permission to:

- submit applications
- prefill application forms
- send LinkedIn messages
- send email outreach
- answer legal/sensitive questions

Those capabilities remain controlled by the connector/autonomy policy and explicit approval layers.
