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

Exact email/phone verification is TBD.

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
