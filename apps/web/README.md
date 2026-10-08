# @qup/web

The student-facing web app: Next.js 16 (App Router), Arabic and RTL-first, styled with the brand
tokens from [UI_BRAND.md](../../UI_BRAND.md). Follows [AGENTS.md](../../AGENTS.md) §9.

## Run

From the repository root — this starts the API and the web app together:

```bash
pnpm install
pnpm dev            # API → http://localhost:3000   web → http://localhost:3001
```

Open http://localhost:3001. The API needs the repo-root `.env` (see `.env.example`).

Production images of both, together: `docker compose up --build` (see `docker-compose.yml`).

## How it talks to the API

The browser never calls the API directly. It calls this app's own `/api/v1/*`, and
`src/app/api/v1/[...path]/route.ts` forwards the request to `API_INTERNAL_URL`.

- **One origin.** No CORS, and the session cookie is first-party, `HttpOnly`, `SameSite=Lax`.
  JavaScript never sees a token.
- **The API address is a runtime setting**, read by the running container — not baked into the
  build, and never sent to the browser.
- **Allow-lists** (`src/lib/api-proxy.ts`, tested): only named request and response headers cross;
  only clean path segments under `/api/v1/` are forwarded; the target host is configuration, never
  taken from the request. Payment webhooks are not reachable through the web app — the provider
  calls the API itself.
- Every proxied response is `Cache-Control: no-store`.

## Screens

| Route | What it does |
| --- | --- |
| `/` | Landing page |
| `/register`, `/login` | Account (email or phone; React Hook Form + Zod) |
| `/exams` | Exams on offer |
| `/exams/:examId/diagnostic` | The free mini diagnostic: start or resume, answer, skip |
| `/assessments/:sessionId/result` | Preliminary result, and plans to subscribe |
| `/payment/return` | Where the payment provider sends the student back; polls the payment |

## Rules this app keeps

- **No business rules here.** Grading, levels, strengths, access and prices are computed by the
  API and only displayed. Form schemas (`src/lib/auth-forms.ts`) only spare a round trip; the API
  validates again and is the authority.
- **No answer keys in the browser** — the API never sends them before an answer.
- **Returning from the payment page proves nothing.** `/payment/return` shows what the API reports,
  which changes only when the provider confirms the money.
- Question content is structured blocks rendered as text, never HTML.
- Server state lives in TanStack Query; errors are shown from the API's stable codes, in Arabic
  (`src/lib/messages.ts`), never as raw server text.

## Environment

| Variable | Where | Meaning |
| --- | --- | --- |
| `API_INTERNAL_URL` | web server, run time | Base URL of the API. Required in production; `http://localhost:3000` in dev. |
| `PORT`, `HOSTNAME` | web server, run time | Listen address in the container (`3000`, `0.0.0.0`). |

## Not built yet

Math rendering (formulas show as their source), the full diagnostic and training screens, the
admin panel, and browser end-to-end tests.
