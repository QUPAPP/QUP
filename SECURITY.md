# Security Requirements

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
