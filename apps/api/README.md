# @qup/api

NestJS 12 + Fastify HTTP API. Follows [ARCHITECTURE.md](../../ARCHITECTURE.md) and
[API_CONTRACTS.md](../../API_CONTRACTS.md).

## Run

```bash
pnpm install
pnpm --filter @qup/api dev          # watch mode; reads the repo-root .env
# or
pnpm build && pnpm --filter @qup/api start
```

`pnpm dev` at the repository root starts this API together with the web app (apps/web). The
production image is `Dockerfile.api` at the repository root (which is also its build context); see
[DEPLOYMENT.md](../../DEPLOYMENT.md). It never runs migrations.

Configuration is validated at startup; the process refuses to boot on a missing or invalid
variable (see `.env.example` for the full list and defaults).

## Endpoints

| Path                    | Purpose                                                           |
| ----------------------- | ----------------------------------------------------------------- |
| `GET /health/live`      | Liveness. No dependencies checked.                               |
| `GET /health/ready`     | Readiness. Pings the database; `503` when unreachable.           |
| `GET /api/openapi.json` | Generated OpenAPI document (off in production unless enabled).   |
| `/api/v1/*`             | Versioned public API.                                             |

## Conventions built in

- **Error envelope** — every failure, including malformed JSON and oversized bodies, returns
  `{ "error": { "code", "message", "requestId" } }`. Only `DomainError` messages reach clients
  verbatim; anything else gets a fixed message per code, so internals never leak.
- **Domain errors** — extend `DomainError` with a stable `code` and a `kind`
  (`NOT_FOUND`, `CONFLICT`, `RULE_VIOLATION`, …). The domain never picks an HTTP status.
- **Request IDs** — `x-request-id` on every response, in every error body and on every log line.
  An upstream id is kept only if it is short and uses safe characters.
- **Logging** — JSON via pino. Requests log id, method and path only: no headers, no query
  string. Credentials are redacted as a second line of defence. Health probes are not logged.
- **Security headers** via helmet; CORS closed unless `CORS_ALLOWED_ORIGINS` is set.
- **No caching** — every response is `Cache-Control: no-store`: the API sits behind a CDN and
  nothing it returns may be stored and replayed to another student.

## Authentication & authorization

- **Every route requires a session** unless marked `@Public()`. Forgetting the decorator fails
  closed.
- `@RequirePermissions(Permission.QuestionsPublish)` guards a route by permission. Code checks
  permissions, never role names — which role holds a permission is seeded data
  (`packages/db/migrations/0003_seed_rbac.sql`).
- Take the caller from `@CurrentPrincipal()`, never from an id in the body or URL.
- Guard order: rate limit → authentication → permissions (`app.module.ts`).
- Mark login-style handlers `@CredentialEndpoint()` to put them under the tight per-IP budget.

Endpoints: `POST /api/v1/auth/register | login | logout | sessions/revoke`, `GET /api/v1/auth/me`.
See [API_CONTRACTS.md](../../API_CONTRACTS.md) and [SECURITY.md](../../SECURITY.md).

### First administrator

There is no HTTP endpoint for this, by design. From a machine with database access:

```bash
pnpm build
pnpm admin:create --email admin@example.com     # or --phone +9665XXXXXXXX
```

The password is read from `QUP_ADMIN_PASSWORD`, or typed at a hidden prompt — never passed as an
argument (arguments leak into shell history). Idempotent. If the account already exists it is
granted ADMIN and **its password is not changed**. Every grant is written to the audit log.

**Not built yet:** password recovery (blocked on OPEN_QUESTIONS.md #6a) and admin user/role
management endpoints.

## Exam catalog

`modules/catalog`: exams and their versioned taxonomy, one module because they are one aggregate
(DOMAIN_MODEL.md §2). Student routes: `GET /api/v1/exams`, `GET /api/v1/exams/:id`. Admin routes
under `/api/v1/admin` — see [API_CONTRACTS.md](../../API_CONTRACTS.md). Security-sensitive changes
(taxonomy publish, role grants) are written to `audit_logs` in the same transaction as the change.

## Question bank

`modules/questions`: authoring, review and publishing of versioned questions — see
[API_CONTRACTS.md](../../API_CONTRACTS.md) "Questions". It reads the taxonomy only through the
catalog's public contract (`catalog/catalog.contract.ts`), never its tables. `toStudentQuestionView`
(`questions/domain/student-view.ts`) is the only shape in which a question may reach a student:
built by allow-list, so a field added later cannot leak the answer key by default.

## Assessments and mastery

`GET /api/v1/assessments` provides the signed-in student's paginated history with optional exam
and status filters. Each item includes the exam name, session lifecycle timestamps and finalized
item count. The store reads a bounded page and aggregates progress in one additional query under
a consistent read-only snapshot; exam names come through `CatalogLookup.examNames`, including
archived exams. No answer keys, attempt payloads or mastery data are returned. See
[API_CONTRACTS.md](../../API_CONTRACTS.md) for pagination limits and the response contract.

`modules/assessments` runs sessions and the answer path (ARCHITECTURE.md §7). `modules/mastery`
persists what `@qup/adaptive-engine` computes. One transaction per submission:

```
lock session row → already answered? (same key ⇒ replay) → insert attempt
→ for each mapped node, in node-id order: lock state row → applyEvidence → update (row_version) → insert event
→ auto-complete when every item is finalized → commit
```

Modules talk through contracts only: `catalog/catalog.contract.ts` (CATALOG_LOOKUP) and
`questions/questions.contract.ts` (QUESTION_READER). The mastery writer runs inside the
assessment store's transaction.

The mini diagnostic ends in a **preliminary result** (`assessments/domain/preliminary-result.ts`): a
pure summary of one session — score, diagnostic level, at most 2 strengths and 3 weaknesses. Its
numbers (level bands, rating cut-offs, the 2/3 limits) are `PRELIMINARY_RESULT_DEFAULTS`, passed in
as config. The Arabic wording and the allow-listed response shape live in
`presentation/assessments.views.ts`; add a field there deliberately, since everything it returns
is visible before payment.

**Pitfall:** drizzle turns off postgres.js date serialization. In a hand-written `sql` template,
pass `date.toISOString()`, never a `Date` — the query builder converts dates, raw templates do not.

## Billing

`modules/billing`: plans, payments and entitlements — one module because a payment succeeding and
its entitlement being granted are one transaction (SECURITY.md "Payments"). Other modules ask only
`EXAM_ACCESS.hasExamAccess` (`billing/billing.contract.ts`).

```
POST /payments → PENDING payment → Stream: one-time product at the plan's price + single-use link
student pays on Stream's page → Stream POSTs /payments/webhooks/stream (signed)
→ verify signature over raw bytes → find payment by link → GET the payment from Stream
→ status PAID and amount matches? → one transaction: payment SUCCEEDED + entitlement + audit
```

Stream lives behind `PaymentProvider` (`billing/domain/ports.ts`); only
`infrastructure/stream/` knows its wire format, written against Stream's published OpenAPI document.
With `STREAM_API_KEY` / `STREAM_WEBHOOK_SECRET` unset the provider is null: checkout answers
`503 PAYMENTS_NOT_CONFIGURED`, everything else works (admin grants included).

**To go live with Stream:** set the two variables (see `.env.example`), register the webhook
`https://<api-host>/api/v1/payments/webhooks/stream` for payment events in Stream's dashboard, set
`PAYMENT_SUCCESS_URL` / `PAYMENT_FAILURE_URL` to the web app. **Not yet verified against a real
Stream account** — the adapter is tested against a local fake speaking the documented format; run
one sandbox payment end to end before real money.

**Pitfall:** entitlement periods are stamped and judged by the *database* clock
(`entitlementSnapshot`). The application clock can differ by seconds — enough to tell a student who
just paid that they have no access.

## Tests

```bash
pnpm --filter @qup/api test
```

Tests build the application through the same `createAdapter` / `configureApp` used in
production, replacing only the database health port and the log sink.

End-to-end tests (`test/**/*.e2e.test.ts`) need `TEST_DATABASE_URL` with migrations applied.
They create real rows, confined to reserved identifiers (`*@e2e.qup.test`, phones `+99912…`,
exam codes `E2E_…`), which are deleted before and after each run. Published taxonomies and audit
entries are trigger-protected, so their cleanup (`test/support/e2e-database.ts`) disables triggers
for its own transaction only; this requires a superuser, which the dev and CI databases use.
