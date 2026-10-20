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
| `TRUST_PROXY` | `true` (behind CranL's proxy and the web app) |
| `DATABASE_URL` | set by CranL: connect the production database to the app (`qup-db-prod`; still `qup-db` today, see Current state) |
| `STREAM_API_KEY`, `STREAM_WEBHOOK_SECRET` | from Stream's dashboard — set in CranL, never in the repo |
| `PAYMENT_SUCCESS_URL`, `PAYMENT_FAILURE_URL` | `https://qupedu.com/payment/return` (both) |

`CORS_ALLOWED_ORIGINS` stays empty: the browser never calls the API cross-origin.

`IMPORT_STORAGE_DIR` (default `var/imports`) is where question-import originals are kept. On CranL
the container disk is not durable: before relying on originals in production, mount persistent
storage there or replace the storage adapter with object storage (OPEN_QUESTIONS.md #16g).

### Environment — qup-web

| Variable | Value |
| --- | --- |
| `API_INTERNAL_URL` | `https://api.qupedu.com` |

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
   `pnpm build && pnpm admin:create --email <admin email>` (apps/api/README.md).
2. **Stream webhook** — in Stream's dashboard register
   `https://api.qupedu.com/api/v1/payments/webhooks/stream` for payment events, then put the secret
   it shows in `STREAM_WEBHOOK_SECRET`.
3. Run one sandbox payment end to end before real money: the Stream adapter has only been tested
   against a local fake of Stream's documented API.

## Current state (2026-10-20)

| App | CranL address | Custom domain | State |
| --- | --- | --- | --- |
| qup-backend | `qup-backend-ladsbz.cranl.net` | `api.qupedu.com` | running; **cannot reach the database** |
| qup-web | `qup-web-4kqgra.cranl.net` | `qupedu.com`, `www.qupedu.com` | running; forwards to qup-backend |

| Database | Internal host | Role | State |
| --- | --- | --- | --- |
| qup-db | `qup-db-pws32w` | development + automated tests; `DATABASE_URL` of qup-backend today | running, migrated |
| qup-db-prod | `qup-db-prod-t7vcqv` | production (real students) | running, **empty, not migrated** |

Both apps have automatic rollback on. `qup-web` currently points `API_INTERNAL_URL` at the backend's
`cranl.net` address; it can switch to `https://api.qupedu.com` once DNS and SSL are up.

`qup-db-prod` is linked to qup-backend as `PROD_DATABASE_URL`, a test variable no code reads. It
stays until CranL support answers the problem below, as live evidence for them. A third app named
`QUP` (`qup-jlcftz.cranl.net`, no domain) has been stuck in "deploying" since 2026-10-08; it is an
early attempt and serves nothing.

**Open problem — database connectivity (reported to CranL support).** No app can resolve any
database's internal host name: qup-backend logs `getaddrinfo ENOTFOUND qup-db-pws32w`, and
`/health/ready` reports the database down. `DATABASE_URL` is correct. Checked on 2026-10-20 from
inside the running containers:

- qup-backend and qup-web resolve each other's names, `localhost` and `github.com`.
- Neither resolves `qup-db-pws32w` nor `qup-db-prod-t7vcqv`.
- `qup-db-prod` was created that day in riyadh-1, so the database's age is not the cause; linking it
  to qup-backend through CranL and restarting the app did not help either.

The earlier guess, that the app and the database sit on different servers, does not explain a
brand-new database failing the same way: this is CranL's internal networking, and only CranL can fix
it. Do **not** work around it with a database's external address: that endpoint has no TLS
(`ssl = off`), so credentials and student data would cross the public network in clear text.

CranL's `run_command` currently returns no output, but its succeeded/failed status follows the
command's exit code, so `getent hosts <internal host>` works as a yes/no check.

Once CranL fixes it, in order, each step reviewed: confirm `qup-db-prod-t7vcqv` resolves from
qup-backend; apply migrations to qup-db-prod (`pnpm db:migrate`, then `pnpm db:verify`); point
`DATABASE_URL` at qup-db-prod and remove `PROD_DATABASE_URL`; check `/health/ready` returns 200;
create the first administrator (§4).

## Rules

- **Migrations are never run by a deploy.** Apply them deliberately (`pnpm db:migrate`), reviewed,
  before deploying code that needs them (packages/db/README.md).
- **Secrets live in CranL's environment settings**, never in the repository or an image.
- The deployed app currently uses `qup-db`, the same database the automated tests run against
  (decided 2026-10-07). Tests only create and delete rows under reserved test identifiers, but a
  separate database for real students is required before public launch: that is `qup-db-prod`
  (created 2026-10-20), not used until the connectivity problem above is fixed.

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
