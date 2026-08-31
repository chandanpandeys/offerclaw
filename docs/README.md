# OfferClaw engineering notes

- [Connector architecture](CONNECTORS.md) — platform capability contracts, autonomy policy and browser-worker boundaries.
- [Job source architecture](JOB_SOURCES.md) — JSearch plus official public Greenhouse, Lever, and Ashby feed adapters.
- [Browser worker contract](BROWSER_WORKER.md) — approval scopes, form planning, prompt-injection boundaries, and future executor design.
- [Browser worker gateway](BROWSER_GATEWAY.md) — inspection-only server boundary for a dedicated remote browser worker.
- [Persistent scout goals](SCOUT_GOALS.md) — reusable search goals, due-state, run evidence, and the authenticated-storage boundary.
- [Anonymous device identity](DEVICE_IDENTITY.md) — signed HttpOnly device sessions and the server-only persistence namespace.
- [Device-scoped scout cloud store](SCOUT_CLOUD_STORE.md) — optional Upstash persistence, bounded data shape, CAS conflict handling, and explicit sync UX.
- [Daily background scout discovery](BACKGROUND_SCOUT.md) — secured Vercel cron, schedule index, discovery-only server runs, and local personalization boundary.
- [OpenClaw-inspired direction](OPENCLAW_DIRECTION.md) — persistent career-agent control-plane roadmap.
