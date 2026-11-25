# Deployment — CranL + qupedu.com

How QUP runs in the cloud. Two apps from this one repository, in the CranL project **QUP**,
region **riyadh-1** (the same region as the database).

```text
student ──► qupedu.com ──► qup-web (Next.js) ──► qup-backend (NestJS) ──► qup-db (PostgreSQL)
Stream  ──► api.qupedu.com/api/v1/payments/webhooks/stream ──► qup-backend
```

The browser only ever talks to `qupedu.com`; the web app forwards API calls server-side
(apps/web/README.md). `api.qupedu.com` exists for the payment provider's webhook.

## 1. Push the code

Both apps build from GitHub (`QUPAPP/QUP`, branch `main`) — the repository CranL's GitHub app is
connected to (https://app.cranl.com/dashboard/github). A push to that branch redeploys both.

## 2. The two apps

| | qup-backend | qup-web |
| --- | --- | --- |
| Build | Dockerfile, `dockerfile_path: Dockerfile.api` | Dockerfile, `dockerfile_path: Dockerfile.web` |
| Build context | repository root | repository root |
| Port | 3000 | 3000 |
| Health | `/health/ready` | `/healthz` |
| Domain | `api.qupedu.com` | `qupedu.com`, `www.qupedu.com` |

### Environment — qup-backend

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `HOST` / `PORT` | `0.0.0.0` / `3000` |
| `TRUST_PROXY` | `1` (CranL's proxy). `true` is refused since C4: it trusted client-written addresses |
| `PROXY_SHARED_SECRET` | 32+ random characters (`openssl rand -hex 32`), the **same** value as qup-web's |
| `DATABASE_URL` | `qup-db-prod`'s **external** address with `?sslmode=require` (see Current state for why not the internal host) |
| `STREAM_API_KEY`, `STREAM_WEBHOOK_SECRET` | from Stream's dashboard — set in CranL, never in the repo |
| `PAYMENT_SUCCESS_URL`, `PAYMENT_FAILURE_URL` | `https://qupedu.com/payment/return` (both) |
| `SNDR_API_KEY`, `SNDR_FROM`, `OTP_SECRET` | email (§4 "Email"): SNDR key with the send scope, a sender on a verified domain, `openssl rand -hex 32`. Set together |
| `SNDR_WEBHOOK_SECRET` | the secret SNDR shows for the registered webhook endpoint |
| `APP_PUBLIC_URL` | `https://qupedu.com` — links inside emails |
| `AI_PROVIDER`, `AI_API_KEY` | `deepseek` and the key from platform.deepseek.com → API keys. Without them AI is off |

`CORS_ALLOWED_ORIGINS` stays empty: the browser never calls the API cross-origin.

**Worker (not deployed yet).** The outbox worker is a second process from the same backend image:
`node dist/worker.js` (`pnpm --filter @qup/api worker`), with the same environment as qup-backend
(including the SNDR and Stream variables) and no port. Without it events accumulate (nothing is lost),
the learning metrics stop updating, **and no receipt, refund notice or password-changed email is sent**.
One-time codes do not need it: they are sent during the request. Adding it on CranL is a separate,
explicit deployment step.

`IMPORT_STORAGE_DIR` (default `var/imports`) is where question-import originals are kept. On CranL
the container disk is not durable: before relying on originals in production, mount persistent
storage there or replace the storage adapter with object storage (OPEN_QUESTIONS.md #16g).

**AI assistance** is off in production by default (`AI_PROVIDER` unset means `disabled`), and the
editor works without it. Do not set `AI_PROVIDER=fake` there: the API refuses to start with it.
Production runs on **DeepSeek** (OPEN_QUESTIONS.md #17): set `AI_PROVIDER=deepseek` and `AI_API_KEY`
(from platform.deepseek.com). `AI_MODEL` defaults to `deepseek-chat`, and replies use DeepSeek's
JSON mode. To run on Claude instead, set `AI_PROVIDER=anthropic` and `ANTHROPIC_API_KEY` (`AI_MODEL`
defaults to `claude-opus-5-5`, `AI_EFFORT` to `medium`). Other vendors: `grok`, `openai`, `groq`,
`openrouter`, `gemini` or `openai-compatible` (the last one also needs `AI_BASE_URL`), plus
`AI_API_KEY` and `AI_MODEL`. Student AI (mistake explanations and the study chat) turns on with the
provider **for subscribers of the exam only**; `AI_STUDENT_EXPLANATIONS=false` and
`AI_STUDY_CHAT=false` hide them (OPEN_QUESTIONS.md #18, #19e). Migration 0020 adds the knowledge
library and chat tables; it needs PostgreSQL's built-in `arabic` text search configuration.

**Startup log.** qup-backend refuses to start when a variable is wrong or one is missing that another
needs, and lists the variable names (never values). When it starts with a feature off (no Stream,
no SNDR, no AI provider), it logs one `[config] … is off: set …` line per feature: those features'
buttons answer 503 until the variables are set.

### Environment — qup-web

| Variable | Value |
| --- | --- |
| `API_INTERNAL_URL` | `https://api.qupedu.com` |
| `PROXY_SHARED_SECRET` | the same value as qup-backend's (C4) |
| `WEB_TRUSTED_PROXY_HOPS` | `1` behind CranL (the default); `0` only when the web app is published with no proxy in front |

**Before the first deploy that includes C4:**

- set `TRUST_PROXY=1` on qup-backend, and the same `PROXY_SHARED_SECRET` on both apps;
- otherwise qup-backend refuses to start, and qup-web answers every API call with an error.

Operations, alerts, backups and incidents: [RUNBOOK.md](RUNBOOK.md).

## 3. DNS at Porkbun (qupedu.com)

| Type | Host | Answer |
| --- | --- | --- |
| CNAME | `api` | the qup-backend app's `*.cranl.net` address |
| ALIAS | *(root)* | the qup-web app's `*.cranl.net` address |
| CNAME | `www` | the qup-web app's `*.cranl.net` address |

The root of a domain cannot be a CNAME; Porkbun's ALIAS record does the same job. Remove the
existing **URL forwarding** on the root first — it conflicts with the ALIAS. SSL is issued by CranL
once DNS resolves.

## 4. After the first deploy

1. **First administrator** — from a machine with database access, never over HTTP:
   `pnpm build && pnpm admin:create --email <admin email>` (apps/api/README.md). To target
   production, set `$env:DATABASE_URL` (PowerShell) to `qup-db-prod`'s TLS URL for that session
   only: a variable already in the environment wins over the repository's `.env`.
2. **Stream keys** — in CranL, on **qup-backend** (not qup-web), set `STREAM_API_KEY` (the
   `x-api-key` value: base64 of `api-key:api-secret`) and `STREAM_WEBHOOK_SECRET`. Set both or
   neither: the API refuses to start with one. Without them every checkout answers 503
   `PAYMENTS_NOT_CONFIGURED` (as of 2026-11-16 neither is set).
3. **Stream webhook** — in Stream's dashboard add a webhook:
   - URL: `https://api.qupedu.com/api/v1/payments/webhooks/stream`
   - events: `PAYMENT_SUCCEEDED`, `PAYMENT_FAILED`, `PAYMENT_CANCELED`, `PAYMENT_REFUNDED`,
     `PAYMENT_MARKED_AS_PAID`
   - secret: whatever the dashboard uses (typed or generated) must be exactly `STREAM_WEBHOOK_SECRET`
     — Stream signs every delivery with it, and a mismatch answers 401 to every event.
4. **Packages** — in `/admin/billing`, "الباقات الأساسية" creates the four drafts (one per exam and
   the bundle) with the prices typed there; review each, then "اعرضها للبيع". A plan priced below
   1.00 SAR cannot be offered.
5. Run one sandbox payment end to end before real money (`STREAM_API_BASE_URL` pointing at Stream's
   sandbox): the Stream adapter has only been tested against a local fake of Stream's documented
   API. Check the payment turns `SUCCEEDED` in `/admin/billing` and the student gets access.

### Email (SNDR)

1. In the SNDR dashboard add the sending domain — use a subdomain such as `mail.qupedu.com`, so mail
   reputation stays apart from the main domain — and add the SPF, DKIM and DMARC records it shows at
   Porkbun (DNS RECORDS). Keep any existing MX records. Click **Verify**; SNDR re-checks every 6 hours
   and pauses a domain whose records stay missing for about 12 hours.
2. Create an API key (**send** scope). On **qup-backend** set `SNDR_API_KEY`, `SNDR_FROM`
   (e.g. `QUP <no-reply@mail.qupedu.com>`), `OTP_SECRET` (`openssl rand -hex 32`) and
   `APP_PUBLIC_URL=https://qupedu.com`. The API refuses to start with a key but no sender or no
   `OTP_SECRET`. Without `SNDR_API_KEY` email is simply off.
3. In SNDR → Webhooks add `https://api.qupedu.com/api/v1/email/webhooks/sndr` for the delivery events
   (`email.delivered`, `email.bounced`, `email.failed`), and put the secret it shows in
   `SNDR_WEBHOOK_SECRET`. Deliveries are retried by SNDR (12 attempts); a mismatched secret answers 401.
4. Check: sign in, open `/verify-email`, press "أرسل لي الرمز", read the mail, verify. Then
   `SELECT kind, status FROM email_deliveries ORDER BY created_at DESC LIMIT 5;` shows SENT, then
   DELIVERED once the webhook arrives (RUNBOOK.md §6b).
5. Deploy the worker (above) so receipts and notices go out.

**Migrations 0021–0024 before merging the launch-readiness release (2026-11-25).** All additive:
0021 (`users.terms_version`, `terms_accepted_at`, `erased_at`, relaxed identifier check), 0022
(`entitlements.ending_reminder_queued_at`), 0023 (one settlement per Stream payment — unique index;
check first that no two payments share a Stream payment id:
`SELECT provider_payload_redacted->>'providerPaymentId', count(*) FROM payments WHERE provider_payload_redacted ? 'providerPaymentId' GROUP BY 1 HAVING count(*) > 1;`
must return nothing), 0024 (`question_assets`). Snapshot, `pnpm db:migrate`, `pnpm db:verify`, then
merge. The new sign-up requires the terms tick: deploy qup-web and qup-backend together.

**Migration 0025** (`question_passages`, `question_versions.passage_id`) is additive too: apply it with 0021–0024.

**Human check (optional, recommended before launch).** In Cloudflare → Turnstile add a widget for
`qupedu.com` (managed mode), then on **qup-backend** set `TURNSTILE_SITE_KEY` and
`TURNSTILE_SECRET_KEY`. Sign-up and "forgot password" then require it; nothing to set on qup-web.

**File storage (STORAGE_DRIVER=s3) before authors upload images.** Create a private bucket on any
S3-compatible provider (Cloudflare R2, AWS S3, or CranL's storage if it speaks S3), a key limited
to that bucket, and set on **qup-backend**: `STORAGE_DRIVER=s3`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`,
`S3_SECRET_ACCESS_KEY`, and `S3_ENDPOINT` / `S3_REGION` as the provider says (`.env.example`).
Without it the API warns at start-up and keeps files on the container's disk, where every redeploy
loses them. Never make the bucket public: files are served through the API.

**Migration 0020 before merging the AI release (2026-11-18).** 0020 (`ai_knowledge_items`,
`ai_knowledge_chunks`, `ai_chat_messages`) is additive. Apply it to `qup-db-prod` first (snapshot,
`pnpm db:migrate`, `pnpm db:verify`), then merge: the code that reads it would otherwise fail on the
library and chat pages. Check 0018 and 0019 are applied too (`pnpm db:verify` reports it).

**Migrations 0018 and 0019 before the code that needs them.** 0019 (`one_time_codes`,
`email_deliveries`) is additive like 0018; apply it the same way before merging code that reads it.

**Migration 0018 before the code that needs it.** Billing code from 2026-11-16 reads `plan_exams`
and `payments.terms` (migration 0018). CranL deploys `main` on push, so apply 0018 to
`qup-db-prod` first (snapshot, `pnpm db:migrate`, `pnpm db:verify` — RUNBOOK.md §3), then merge.
The migration is additive: the code already running keeps working on the migrated schema.

## Current state (2026-10-27)

| App | CranL address | Custom domain | State |
| --- | --- | --- | --- |
| qup-backend | `qup-backend-ladsbz.cranl.net` | `api.qupedu.com` (**no DNS record yet**) | running; `/health/ready` 200, database up |
| qup-web | `qup-web-4kqgra.cranl.net` | `qupedu.com`, `www.qupedu.com` | running; forwards to qup-backend |

| Database | Internal host | Role | State |
| --- | --- | --- | --- |
| qup-db | `qup-db-pws32w` | development + automated tests | running, migrated; no app uses it |
| qup-db-prod | `qup-db-prod-t7vcqv` | production (real students); `DATABASE_URL` of qup-backend | running, 17 migrations applied, TLS on |

A CranL uptime monitor (2026-10-27, "QUP API readiness (database)") checks qup-backend's
`/health/ready` every minute: two failures notify the account (`app.down`), recovery sends `app.up`.

Both apps have automatic rollback on. `qup-web` points `API_INTERNAL_URL` at the backend's
`cranl.net` address; it can switch to `https://api.qupedu.com` once the `api` CNAME (§3) exists and
CranL has issued its certificate. A third app named `QUP` (`qup-jlcftz.cranl.net`, no domain) has
been stuck in "deploying" since 2026-10-08; it is an early attempt and serves nothing.

**Database connection: external address over TLS.** CranL's internal names still do not resolve
from QUP's apps (`getaddrinfo ENOTFOUND qup-db-prod-t7vcqv`, also `qup-db-pws32w`; first seen
2026-10-20), while another account project reaches its database internally — so the fault is
specific to this project's network. CranL support's answer was to use the external connection. Its
PostgreSQL ships with `ssl = off`, so on 2026-10-27 TLS was turned on in qup-db-prod itself:

- a self-signed certificate and key generated **on the database server** (`server.crt`,
  `server.key` in the data directory; the key never left it, mode 600);
- `ALTER SYSTEM SET ssl = on` and `pg_reload_conf()`: no restart, no downtime;
- qup-backend's `DATABASE_URL` is the external address with `?sslmode=require`; `pg_stat_ssl`
  shows its connection as TLSv1.3, `TLS_AES_256_GCM_SHA384`.

Still open, in order of priority:

- the external port is reachable from the internet and still **accepts unencrypted** connections:
  once every client uses TLS, reject the rest with `hostssl` in `pg_hba.conf`;
- the app connects as the database superuser `admin`, whose password crossed the network once in
  clear text before TLS was on: give the app its own least-privilege role, then rotate `admin`;
- `sslmode=require` encrypts but does not verify the server; `verify-full` needs a certificate the
  app can trust for the external host name;
- if CranL fixes internal DNS, prefer the internal host (`qup-db-prod-t7vcqv`) again.

CranL's `run_command` returns no output, but its succeeded/failed status follows the command's exit
code, so `getent hosts <internal host>` works as a yes/no check.

## Rules

- **Migrations are never run by a deploy.** Apply them deliberately (`pnpm db:migrate`), reviewed,
  before deploying code that needs them (packages/db/README.md).
- **Secrets live in CranL's environment settings**, never in the repository or an image.
- Production uses `qup-db-prod`. `qup-db` stays for development and the automated tests; never
  point a test run or a local `.env` at `qup-db-prod`.
- Migrations reach `qup-db-prod` from a reviewed machine over TLS: set `DATABASE_URL` to its
  external `?sslmode=require` URL for one shell session, run `pnpm db:migrate` then
  `pnpm db:verify`, and clear the variable. The image carries no migrations.

## Why the Dockerfiles are at the repository root

CranL uses the Dockerfile's own directory as the build context. With the files under `apps/*/`
the build could not see the workspace (`pnpm-workspace.yaml`, `packages/`) and failed with
"not found". At the root, the context is the whole repository. Likewise, an app created with
automatic framework detection on this repository builds but never serves: the workspace root has no
start command. Each app must be created with `build: dockerfile` and its `dockerfile_path`.

## Known issue (2026-10-07)

Deploying by uploading the source directly (`deploy_source`) failed on CranL's side: the build
server reported that the app's code directory did not exist (request ids `req_9e69ab8bae3542d9a2f9`,
`req_9bf515a247704f1d973b`, `req_47a3dbd230074de2ad63`). Deploying from GitHub avoids that path.
