# Security Requirements

## Dependency audit — 2026-10-27

`pnpm audit` (all dependencies, not only production) is clean. It reported 22 advisories; the
runtime ones:

- `next` 16.4.0 (GHSA-2464-fhr4-w9xw and GHSA-673q-mjm6-r5xr, critical: unauthenticated remote
  code execution through image optimization of SVG and through `use cache`; GHSA-p3m5-59mp-jv5r,
  high: denial of service with Server Actions): upgraded to 16.4.2 in `apps/web`.
- `zod` <4.6.6 (high: memory exhaustion validating oversized constrained collections): every
  workspace package now declares `^4.6.7`.
- `fastify` 5.12.5 (GHSA-389g-gv7q-r4x8, low): 5.12.7 in `apps/api`, and the same release forced
  for `@nestjs/platform-fastify`'s pinned copy.
- `fast-uri` (moderate/low: scheme spoofing, host confusion) via `fastify`: forced to 4.2.3.

Development-only, fixed the same way: `vitest` 5.0.5 (`@vitest/mocker` code injection), `vite`
8.3.3 via `unplugin-swc`, `fast-uri` 3.1.9 via `@nestjs/cli`, `esbuild` 0.25.12 via
`drizzle-kit`. Overrides live in `pnpm-workspace.yaml`, each with its advisory.

Verified after the upgrade: typecheck, lint, the production build, `db:check`, and all 817 tests,
including the API end-to-end suite against a disposable PostgreSQL 18.

## Dependency audit — 2026-10-21 (C4)

`pnpm audit --prod` is clean. On 2026-10-21 it reported three advisories, fixed in C4:

- `drizzle-orm` <0.45.2 (GHSA-gpj5-g38j-94v9, high): upgraded to 0.45.4 in `apps/api` and
  `packages/db`.
- `fflate` <0.8.3 (GHSA-px8p-9vwx-vf98, moderate): an infinite loop on a malformed ZIP64 archive,
  reachable through the XLSX question import. Upgraded to 0.8.3.
- `source-map-js` <1.2.2 via `next > postcss` (GHSA-68fv-2mgg-jv7q, high): forced to >=1.2.2 by a
  pnpm override (`pnpm-workspace.yaml`).

Rerun `pnpm audit --prod` before each release, and whenever dependencies change.

## High-Value Assets

- student accounts.
- assessment integrity.
- question bank/correct answers.
- payment state.
- personal data.
- admin/content permissions.
- provider credentials.
- uploaded files.

## Authentication

Recommended baseline:
- opaque server-managed sessions.
- HttpOnly + Secure cookies.
- SameSite appropriate to deployment.
- session revocation/rotation.
- Argon2id passwords.
- rate limiting.

Sign-up: email, phone, or both; sign-in with either. No OTP/ownership verification
(OPEN_QUESTIONS.md #6, decided 2026-09-22). Consequence tracked as #6a: no safe
self-service password recovery yet.

Implemented (apps/api):
- session token: 256 random bits; only its SHA-256 digest is stored.
- cookie: HttpOnly, SameSite=Lax, Secure + `__Host-` prefix in production.
- passwords: Argon2id (m=19 MiB, t=2, p=1); 12–128 characters, no composition rules (OWASP ASVS V2.1).
- login: identical response and comparable timing for unknown account vs wrong password.
- suspending a user revokes access on the next request, not at session expiry.
- rate limit: per-IP budget on login/register (in-memory; move to Redis before running multiple instances).

## Authorization

Backend enforcement always.

Permissions examples:
```text
questions.create
questions.review
questions.publish
taxonomy.manage
users.manage
billing.manage
audit.view
ai.manage
```

Prevent IDOR via ownership checks; never trust `studentId` from client for self resources.

## Assessment Integrity

- future correct answer never sent to browser.
- grading server-side.
- finalized item cannot be reanswered.
- question version fixed once presented.
- request replay controlled by idempotency.

## File Uploads

- allowlist + signature checks.
- size/page/row limits.
- private storage.
- random storage keys.
- no user filesystem paths.
- safe extraction.
- no macro execution.
- parser isolation where practical.
- async heavy processing.

## AI Security

- external text is untrusted.
- no secrets in prompts.
- minimize PII.
- validate structured output.
- content cannot invoke tools/actions.
- AI cannot bypass publish approval.

## Database

- least privilege.
- parameterized queries.
- reviewed migrations.
- encrypted backups as supported.
- restricted production access.
- restore testing.

## Payments

- verify webhook signatures.
- replay/idempotency protection.
- do not store card data outside provider scope.
- browser redirect is not payment authority.
- server validates amount/currency/plan.
- entitlement grant atomic with successful payment state.

Implemented (Stream):
- Webhook authenticated by HMAC-SHA256 over the exact request bytes (`X-Webhook-Signature`),
  constant-time compare, before the body is parsed. The route is the only `@Public()` write.
- The event is a hint, not the authority: status, amount and currency are re-read from Stream's API
  before any transition. Makes forged-content, stale and replayed events harmless — which is why no
  timestamp tolerance is enforced (Stream retries for 12 h and does not document re-signing).
- A payment found by its checkout must also match the payment id echoed in the event metadata.
- Paid amount ≠ recorded amount ⇒ no entitlement, error logged.
- Stream credentials come from the environment only, are redacted from logs, are sent to the
  configured base URL only (redirects refused, https required in production), and never appear in
  errors. No card data reaches QUP: payment happens on Stream's hosted page.
- Checkout takes only `planId` from the client; price from the plan, student from the session.

## Web Security

Implemented (C4, 2026-10-21):

- **CSP** on every page (`apps/web/src/proxy.ts`, `src/lib/csp.ts`):
  - scripts only with a per-request nonce plus `'strict-dynamic'`;
  - `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`;
  - `upgrade-insecure-requests` in production.
  - Inline styles stay allowed.
- **Cross-site writes** through the web app's API proxy are refused (`403 CROSS_SITE_REQUEST`), by
  `Sec-Fetch-Site`, or by `Origin` for older browsers. This is a second line behind
  `SameSite=Lax`.
- **Trusted client address for rate limits:**
  - the API trusts a counted number of proxies (`TRUST_PROXY=1`), never every `X-Forwarded-For`
    entry;
  - the web app never forwards the browser's `X-Forwarded-For`. It names the student in
    `x-qup-client-ip`, proven by `PROXY_SHARED_SECRET` (constant-time comparison, redacted from
    logs).

Before C4, a client could choose its own address, and so reset the login rate limit on every
request.

Required:

- CSP.
- security headers.
- output encoding/sanitization.
- CSRF protection where applicable.
- strict CORS allowlist.
- rate limiting.
- request body limits.
- dependency/secrets scanning.

## Logging

Never log:
- passwords.
- session tokens.
- authorization headers.
- provider secrets.
- sensitive payment payload.

Audit:
- role/permission changes.
- question publish/archive.
- taxonomy publish.
- billing changes.
- AI settings.
- security-sensitive actions.

## Feature Security Checklist

Ask:
- Can Student A access Student B data?
- Can client forge correctness?
- Can request be replayed?
- Can user mass-assign protected fields?
- Can upload execute/fetch internal resources?
- Can AI text inject instructions?
- Can historical question/taxonomy data be altered?
- Can payment grant happen twice?
- Does response leak answer keys?
