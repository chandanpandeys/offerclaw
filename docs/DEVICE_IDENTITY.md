# Anonymous device identity

OfferClaw needs an identity boundary before any career data can be stored in shared server infrastructure. This is intentionally smaller than an account system.

## What the identity is

`POST /api/identity/session` issues a random, non-PII device subject and signs it with `OFFERCLAW_IDENTITY_SECRET` using HMAC-SHA256. The signed token is stored in a same-origin `HttpOnly` cookie.

The token contains only:

- schema version
- random device subject
- issued-at timestamp
- expiry timestamp

It never contains profile, resume, search-goal, job, application, salary, work-authorization, or message data.

## Browser contract

- `GET /api/identity/session` reports whether a valid session exists.
- `POST /api/identity/session` creates a session or refreshes one near expiry.
- `DELETE /api/identity/session` clears the device cookie.
- JSON responses never include the raw token or device subject.
- The cookie is `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` in production/Vercel environments.
- State-changing session calls reject foreign `Origin` values.
- Responses use `Cache-Control: no-store`.

## Server storage namespace

Server-only code may derive a deterministic namespace with `identityNamespace(subject)`, for example:

```text
offerclaw:v1:device:<random-subject>
```

The browser must never choose this namespace and must never be allowed to supply an arbitrary subject. Future Redis/Postgres persistence should derive the namespace only from a successfully verified cookie.

## What this does not provide

Anonymous device identity is not multi-device synchronization, account recovery, email/social login, or proof that a specific human owns the browser. Clearing cookies loses the identity unless a later account-linking mechanism exists.

For that reason, durable server persistence introduced on top of this boundary should initially be treated as device-scoped state. Account linking can migrate or associate namespaces later.

## Secret rotation

Changing `OFFERCLAW_IDENTITY_SECRET` invalidates existing device cookies. Rotation should therefore be deliberate and accompanied by a migration/account-recovery plan once server-stored user state exists.

## Next step

The next persistence layer may use the verified device identity to isolate scout goals/run records in durable storage. Cron execution still requires a server-owned schedule/index of active namespaces; it must not infer identity from browser-controlled fields.
