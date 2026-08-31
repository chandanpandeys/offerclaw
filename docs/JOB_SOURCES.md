# Job source architecture

OfferClaw can combine an aggregated search provider with configured official public ATS job feeds.

## Current native sources

### JSearch

JSearch remains the broad discovery source when `JSEARCH_API_KEY` is configured.

### Greenhouse

Greenhouse's public Job Board GET API can list published jobs without authentication. OfferClaw uses only the read-only public endpoint and constructs the API URL from a validated board token.

### Lever

Lever's public Postings API exposes published jobs by site name. OfferClaw supports both the global and EU public posting endpoints.

### Ashby

Ashby's public Job Postings API exposes listed jobs for a public job board. OfferClaw filters out records explicitly marked `isListed: false`.

## Configuration

Configure up to six direct sources through the server-only `PUBLIC_ATS_SOURCES` environment variable.

Compact syntax:

```text
PUBLIC_ATS_SOURCES=greenhouse:example=Example;lever:another=Another;ashby:third=Third
```

JSON syntax:

```json
[
  { "provider": "greenhouse", "site": "example", "label": "Example" },
  { "provider": "lever", "site": "another", "label": "Another" }
]
```

Supported provider identifiers:

```text
greenhouse
lever
lever_eu
ashby
```

The configured board/site identifiers remain server-side. `/api/health` exposes only provider names and the number of configured public feeds.

## Request safety

The jobs API does **not** accept arbitrary upstream URLs.

The environment parser accepts only known provider identifiers and board/site tokens matching a restricted character set. The server itself constructs requests to fixed official API origins. This prevents the job-source feature from becoming a generic server-side request proxy.

## Failure behavior

Sources are fetched independently.

If one source fails but another succeeds, OfferClaw returns the successful jobs and marks the response as partial. If all configured sources fail, the endpoint returns an error rather than silently presenting demo data as live.

Direct-source matches are placed before aggregated results and the combined set is deduplicated by application URL or source job ID.

## Read versus write

Public job feeds are **read-only discovery** in OfferClaw.

Application submission is deliberately not enabled just because an ATS exposes a submission endpoint. Employer-side API credentials, custom questions, consent requirements, attachments, rate limits and user approval all belong to the separate action/browser-worker layer.

This separation is intentional:

```text
Official public job feeds
          |
          v
  normalized live jobs
          |
          v
source intelligence + ranking
          |
          v
 application preparation
          |
          v
 approval-gated executor
```

## Future source adapters

Workday, SmartRecruiters, Workable, Jobvite, iCIMS and BambooHR remain connector contracts/browser-worker candidates until OfferClaw has an approved and maintainable native read path for them.
