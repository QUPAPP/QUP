# C4 — Hardening

Date: 2026-10-21. Branch: `ahmeddev`. Executed on the user's request ("كمّل بالشريحة C4"). Assumed
rules are recorded in `OPEN_QUESTIONS.md` #21b and #22a.

## Why

`IMPLEMENTATION_PLAN.md` Phase 10 lists the hardening work:

- security testing;
- load/performance profiling;
- a backup restore test;
- observability alerts;
- accessibility, and browser/device QA;
- production runbooks.

A review of the current code against `SECURITY.md` found four concrete problems.

1. **Client addresses can be forged.** The web proxy forwards the browser's own `X-Forwarded-For`.
   In production `TRUST_PROXY=true`, and Fastify then takes the left-most entry as the client. A
   client can put any address there, so every per-IP limit (login, register, AI, global) can be
   bypassed by changing that header on each request.
2. **Vulnerable dependencies.** `pnpm audit --prod` reports three:
   - `drizzle-orm` <0.45.2, high;
   - `source-map-js` <1.2.2 through Next/PostCSS, high;
   - `fflate` <0.8.3, moderate. It is the XLSX reader of the import (A3): a malformed ZIP64 upload
     can loop forever and block the API.
3. **No Content Security Policy** on the web app. `SECURITY.md` "Web Security" asks for one.
4. **No cross-site write check.** A SameSite=Lax cookie is the only CSRF defence.

## What gets built

### 1. Trusted client address

- **API:**
  - `TRUST_PROXY` becomes `false` or a hop count (`1` behind CranL). With a hop count, Fastify
    takes the address that the nearest trusted proxy saw. `true` is refused with a message, because
    it trusts any client-written address.
  - New `PROXY_SHARED_SECRET` (≥ 32 characters). It is required in production, because the browser
    always reaches the API through the web app.
  - A request carrying `x-qup-proxy-secret` equal to it (constant-time comparison) and a valid IP in
    `x-qup-client-ip` is attributed to that IP. Otherwise the address is Fastify's `request.ip`.
  - All three rate budgets track this address.
- **Web proxy:**
  - It never forwards the browser's `x-forwarded-for`.
  - It sends the secret and the client IP: the right-most `x-forwarded-for` entry it receives,
    which its own edge proxy appended. Next.js fills the header from the socket when no proxy set it.
  - In production, a missing secret is a server error, like a missing `API_INTERNAL_URL`.

### 2. Cross-site write refusal (web proxy)

- `POST`, `PUT`, `PATCH` and `DELETE` through `/api/v1/*` are refused with `403 CROSS_SITE_REQUEST`
  in two cases:
  - `Sec-Fetch-Site` is present and is not `same-origin`;
  - without that header, an `Origin` whose host differs from the request's host (`x-forwarded-host`,
    else `host`).
- Requests with neither header (non-browser clients) pass. CSRF is a browser attack, and the API
  still checks the session.

### 3. Content Security Policy (web)

- `src/proxy.ts` creates a fresh nonce per request (128 random bits, base64). It sends a policy built
  by `buildContentSecurityPolicy({ nonce, development })`:
  `default-src 'self'; script-src 'self' 'nonce-…' 'strict-dynamic'; style-src 'self'
  'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; object-src
  'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`.
  - Production adds `upgrade-insecure-requests`.
  - Development adds `'unsafe-eval'`, which React needs for its debugging.
  - Inline styles stay allowed: three components use style attributes, and a nonce cannot cover
    attributes.
- The policy covers pages only, not `/api`, `/_next/static`, `/_next/image`, images or prefetches.
- The root layout awaits `connection()`. Every page is then rendered per request, so its scripts get
  the nonce (the Next.js CSP guide).

### 4. Dependencies

- `drizzle-orm` ^0.45.2 in `apps/api` and `packages/db`, with a matching `drizzle-kit`.
- `fflate` ^0.8.3.
- A pnpm override `source-map-js` >=1.2.2.
- `pnpm audit --prod` must come back clean.

### 5. Operations

- `scripts/backup-restore-check.sh DATABASE_URL`:
  1. `pg_dump -Fc` the database and restore it into a new scratch database.
  2. Compare the row count of every table and the applied migration count with the source.
  3. Drop the scratch database, and exit non-zero on any difference.

  It is run against the local database.
- **Answer-path performance check:** `pnpm --filter @qup/api perf`. 20 students take a mini
  diagnostic at the same time through the real application against the test database. It reports
  p50/p95/max latency per answer and fails when p95 exceeds 500 ms. It is not part of
  `pnpm test`.
- `RUNBOOK.md`: deploy and rollback; migrations; backup and restore; the outbox worker; secret
  rotation (proxy secret, Stream, sessions); turning AI off; payment webhook failures. It also lists
  the alerts an operator watches, from `/health` and `/admin/analytics`, until a monitoring
  service is chosen.

### 6. QA

A browser pass on a phone width (375 px) and a desktop width, covering:

- sign-in, the dashboard, the assessment runner, the skill profile;
- the admin question editor, imports and the AI page.

It checks for CSP violations in the console, horizontal overflow, headings and labels, and keyboard
focus. Problems found are fixed.

## Out of scope

- **Sentry and OpenTelemetry.** They need a vendor and data-processing decision and an account
  (`OPEN_QUESTIONS.md` #21b).
- Redis-backed rate limits (single instance today).
- Restoring backups on CranL (an operator step in the runbook).
- Load tests against production.

## Testing

- **API config:**
  - `TRUST_PROXY` hop counts;
  - `true` refused;
  - the secret required in production, with a minimum length.
- **API e2e (rate limits):**
  - forged left-most addresses share one budget behind one hop;
  - a valid proxy secret separates clients by `x-qup-client-ip`;
  - a wrong secret or a malformed IP is ignored.
- **Web unit:**
  - forwarded headers (browser `x-forwarded-for` dropped; secret and client IP added; right-most
    hop used; invalid IPs dropped);
  - the cross-site decision table;
  - the CSP builder (nonce present, no `unsafe-inline` in `script-src`, dev and prod differences).
- **Dependencies:** `pnpm audit --prod`, then the full suites.
- **Ops:** the backup check and the perf check run locally, and their output is recorded.
- **Browser:** the QA pass above, run against a production build for the CSP.
