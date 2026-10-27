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

`CORS_ALLOWED_ORIGINS` stays empty: the browser never calls the API cross-origin.

**Worker (not deployed yet).** The outbox worker is a second process from the same backend image:
`node dist/worker.js` (`pnpm --filter @qup/api worker`), with the same environment as qup-backend
and no port. Without it events accumulate (nothing is lost) and the learning metrics stop updating.
Adding it on CranL is a separate, explicit deployment step.

`IMPORT_STORAGE_DIR` (default `var/imports`) is where question-import originals are kept. On CranL
the container disk is not durable: before relying on originals in production, mount persistent
storage there or replace the storage adapter with object storage (OPEN_QUESTIONS.md #16g).

**AI assistance** is off in production by default (`AI_PROVIDER` unset means `disabled`), and the
editor works without it. Do not set `AI_PROVIDER=fake` there: the API refuses to start with it. A
real provider needs OPEN_QUESTIONS.md #17 and its own adapter first.

### Environment — qup-web

| Variable | Value |
| --- | --- |
| `API_INTERNAL_URL` | `https://api.qupedu.com` |
| `PROXY_SHARED_SECRET` | the same value as qup-backend's (C4) |

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
2. **Stream webhook** — in Stream's dashboard register
   `https://api.qupedu.com/api/v1/payments/webhooks/stream` for payment events, then put the secret
   it shows in `STREAM_WEBHOOK_SECRET`.
3. Run one sandbox payment end to end before real money: the Stream adapter has only been tested
   against a local fake of Stream's documented API.

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
