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
| `DATABASE_URL` | set by CranL: connect `qup-db` to the app |
| `STREAM_API_KEY`, `STREAM_WEBHOOK_SECRET` | from Stream's dashboard — set in CranL, never in the repo |
| `PAYMENT_SUCCESS_URL`, `PAYMENT_FAILURE_URL` | `https://qupedu.com/payment/return` (both) |

`CORS_ALLOWED_ORIGINS` stays empty: the browser never calls the API cross-origin.

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

## Rules

- **Migrations are never run by a deploy.** Apply them deliberately (`pnpm db:migrate`), reviewed,
  before deploying code that needs them (packages/db/README.md).
- **Secrets live in CranL's environment settings**, never in the repository or an image.
- The deployed app currently uses `qup-db`, the same database the automated tests run against
  (decided 2026-10-07). Tests only create and delete rows under reserved test identifiers, but a
  separate database for real students is required before public launch.

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
