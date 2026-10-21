# QUP Production Runbook

What an operator does when something needs doing or goes wrong. The topology, apps and environment
are in [DEPLOYMENT.md](DEPLOYMENT.md). Every step that changes production is deliberate and done by
a person: nothing here runs automatically.

```text
student ──► qupedu.com ──► qup-web ──► qup-backend ──► PostgreSQL
                                          ▲
Stream ──► api.qupedu.com (webhooks) ─────┘      outbox worker (second process, same image)
```

## 1. What to watch

No monitoring service is chosen yet (OPEN_QUESTIONS.md #21b). Until then, these are the alerts and
where to read them by hand. Check them daily, and after every deploy.

| Signal | Where | Act when | First step |
| --- | --- | --- | --- |
| API readiness | `GET https://api.qupedu.com/health/ready` | not 200 | §8 Database down |
| Web up | `GET https://qupedu.com/healthz` | not 200 | CranL logs of qup-web; redeploy the last good build |
| Server errors | CranL logs of qup-backend: `level 50` lines "Request failed" | more than a few an hour, or any `INTERNAL_ERROR` burst | read `code` and `requestId`, then §9 |
| Outbox backlog | `/admin/analytics` → outbox card | `failed` > 0, or oldest pending older than 5 minutes | §5 Outbox worker |
| AI failures | `/admin/ai` → 24-hour counts | `TIMED_OUT` or `FAILED` rising | §7 Turning AI off |
| Payments | Stream dashboard, and `payments` rows `PENDING` older than the checkout lifetime (60 min) | a paid student without access | §6 Payment webhooks |
| Rate limits | API logs: many `RATE_LIMITED` (429) | students report "محاولات كثيرة" on login | §4 Client address |

## 2. Deploy and roll back

**Before a deploy:**

1. Run all gates on the commit: `pnpm typecheck && pnpm check && pnpm test && pnpm build`.
2. If the commit adds migrations, apply them first (§3). Migrations are additive, so the running
   code keeps working.
3. If the commit needs new environment variables (see its DEPLOYMENT.md changes), set them in
   CranL for **both** apps before the deploy.

**Deploy:** push to `main` of `QUPAPP/QUP`. CranL rebuilds qup-backend and qup-web.

**After the deploy:** check the health endpoints (§1). Sign in once as a student, and once as an
admin.

**Roll back:** both apps have automatic rollback on a failed health check. To roll back by hand,
redeploy the previous good deployment from CranL (app → deployments → rollback).

Migrations are never rolled back. A bad migration gets a new, forward-fixing migration (AGENTS.md
§7).

## 3. Migrations

```bash
DATABASE_URL=<target> pnpm db:migrate   # applies pending migrations in order
DATABASE_URL=<target> pnpm db:verify    # checks the schema matches the code
```

- Run them from a machine with database access, reviewed, before the code that needs them.
- Take a snapshot first (§4b).
- Never run them against production without the explicit go-ahead of whoever owns it.

## 4. Client address and rate limits (C4)

The API limits requests per client address. Students reach it through qup-web, so qup-web names
each student's address. It proves it is qup-web with a shared secret.

- **qup-backend:**
  - `TRUST_PROXY=1`, for CranL's proxy in front of it. `true` is refused at start, because it would
    trust addresses the client writes.
  - `PROXY_SHARED_SECRET`, at least 32 random characters. It is required in production.
- **qup-web:** the same `PROXY_SHARED_SECRET`.

| Symptom | Cause | Fix |
| --- | --- | --- |
| qup-backend does not start: "TRUST_PROXY: must be false or the number of proxies" | `TRUST_PROXY=true` from before C4 | set `TRUST_PROXY=1` |
| qup-backend does not start: "PROXY_SHARED_SECRET: required in production" | secret missing | set it on both apps (§4a) |
| every API call through the site fails with 500 | secret missing on qup-web | set it on qup-web |
| many students get 429 on login at once | the secrets differ, so every student counts as qup-web | set the same value on both apps |

### 4a. Rotating the proxy secret

1. Generate a new secret: `openssl rand -hex 32`.
2. Set it on qup-backend, then right away on qup-web.

Between the two steps, students share one rate budget, so rotate at a quiet hour. No request is
refused because of the mismatch.

### 4b. Other secrets

- **Stream keys:** create new ones in Stream's dashboard. Set `STREAM_API_KEY` and
  `STREAM_WEBHOOK_SECRET`, then re-register the webhook if Stream issues a new secret (§6).
- **Sign everyone out** (suspected session theft): delete all rows of `auth_sessions`.
  - This is destructive: every user must sign in again.
  - Do it only on the owner's decision. Tokens are stored only as hashes, so nothing else is needed.
- **An administrator's password:** reset it with `pnpm admin:create --email <email>` from a machine
  with database access (apps/api/README.md).

## 5. Outbox worker

- **Role:** the worker drains `outbox_events` into `learning_events`, which the learning metrics
  read.
- **Run:** a second process from the qup-backend image, `node dist/worker.js`, with the same
  environment and no port (DEPLOYMENT.md). It is not deployed yet.
- **Stopped worker:** events wait and nothing is lost. The learning metrics stop updating.
- **Failed events:** after 8 attempts an event is `FAILED`, with `last_error`. Fix the cause, then
  requeue that event:

  ```sql
  UPDATE outbox_events
  SET status = 'PENDING', attempts = 0, available_at = now(), last_error = NULL
  WHERE id = '<event id>' AND status = 'FAILED';
  ```

  Projecting an event twice is harmless: `learning_events.id` is the outbox id.

## 6. Payment webhooks

- **Signature failures:** request-log lines for `/api/v1/payments/webhooks/stream` answered with a
  4xx (`WEBHOOK_SIGNATURE_INVALID`). `STREAM_WEBHOOK_SECRET` does not match the secret Stream shows
  for the registered endpoint: copy it again from Stream's dashboard.
- **A student paid but has no access:**
  1. Find the payment row (`payments`, by the student).
  2. If it is `PENDING`, have Stream redeliver the event from its dashboard. Delivery is idempotent:
     a replay never grants twice.
  3. If Stream says paid but the event never arrives, grant access as an admin with
     `POST /api/v1/admin/entitlements` (API_CONTRACTS.md "Billing"; audited, no screen yet), and
     tell Stream support.
- **Never** mark a payment as paid in the database by hand.

## 7. Turning AI off

Set `AI_PROVIDER=disabled` on qup-backend and restart it. Then:

- the AI panel disappears from the question editor;
- `/admin/ai` says AI is off;
- authors carry on by hand.

Production is off by default until a real provider is chosen (OPEN_QUESTIONS.md #17, #19a).

## 8. Database down

1. `GET /health/ready` names the database as down. Check the database's state in CranL.
2. If it is running but unreachable from the app, it is CranL's internal networking: see
   "Open problem — database connectivity" in DEPLOYMENT.md, and contact CranL support.
3. Do **not** switch to the database's external address. It has no TLS.

## 9. Backups and restore

**Backups:** take a CranL snapshot of the production database before every migration, and on a
schedule (`snapshot_database`; CranL keeps them).

**Check that a backup restores,** monthly and after any schema change:

```bash
scripts/backup-restore-check.sh "<database url>"
```

- It dumps the database and restores the dump into a scratch database on the same server.
- It compares every table's row count and the migration count, then drops the scratch database.
- It only reads the source.
- Run it at a quiet time: rows written while it runs show up as differences.

Local result, 2026-10-21: `OK: dump 164K, 38 tables, 148 rows, 17 migrations restored identically
in 0s`.

**Restore after data loss:**

1. Restore the snapshot into a **new** database in CranL. Never restore over the damaged one, which
   may hold evidence.
2. Run the check above against it.
3. Point `DATABASE_URL` of qup-backend (and the worker) at it, and restart.
4. Check `/health/ready`, then sign in as a student and as an admin.

## 10. Performance check

```bash
pnpm --filter @qup/api perf                   # 20 students answering at once
PERF_STUDENTS=100 pnpm --filter @qup/api perf
```

It runs the real application in-process against the test database (`TEST_DATABASE_URL`). It
reports answer latency, and fails when p95 exceeds 500 ms.

Local results, 2026-10-21 (Apple silicon, PostgreSQL 16, pool of 10):

| Students | Answers | p50 | p95 | max | Answers/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 240 | 32 ms | 47 ms | 51 ms | 330 |
| 100 | 1,200 | 123 ms | 156 ms | 177 ms | 406 |

Latency grows with concurrency once the database pool (`DATABASE_POOL_MAX`, 10) is busy. Raise the
pool only if the database allows the connections. CranL's network adds its own latency: these
numbers are a baseline for regressions, not a production forecast.
