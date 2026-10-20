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
| `/dashboard` | Private session history, status filter, pagination and result/resume links |
| `/subscriptions` | Exam selector, server-priced plans, access state and hosted checkout |
| `/account` | Account details, sign out, and revoke other device sessions |
| `/exams` | Exams on offer |
| `/exams/:examId/diagnostic` | The free mini diagnostic: start or resume, answer, skip |
| `/exams/:examId/profile` | Paid skill profile: summary, gaps by priority, every skill and subskill with its state |
| `/assessments/:sessionId` | Resume the exact mini diagnostic at its next unanswered item |
| `/assessments/:sessionId/result` | Preliminary result, and plans to subscribe |
| `/payment/return` | Where the payment provider sends the student back; polls the payment |
| `/admin/exams` | Admin: every exam with its status; create an exam |
| `/admin/exams/:examId` | Admin: edit names, move the status forward, list and start taxonomy versions |
| `/admin/taxonomy-versions/:versionId` | Admin: the taxonomy tree; edit it while DRAFT, then publish |
| `/admin/questions` | Question bank: filter by status and taxonomy version, paged list with stem previews |
| `/admin/questions/new` | The question editor; saving creates a DRAFT |
| `/admin/questions/:questionId` | A question's versions; start the next version; archive (admin) |
| `/admin/question-versions/:versionId` | Preview, review history and the workflow: edit/submit, review, publish |
| `/admin/settings` | Admin: versioned settings — the diagnostic level boundaries and their history |

### Admin panel

`/admin/*` has its own frame (`AdminShell`) listing only the screens the account may use, from the
`permissions` that `/auth/me` returns (`src/lib/permissions.ts`). The student workspace links to it
only for accounts with an admin permission. Each page also checks its own permission through
`AdminGate`: no session sends the visitor to `/login`; an account without the permission sees a
no-permission state and no admin query runs. None of this is security — the API refuses every
admin call it should.

- Forms mirror the API's limits (`src/lib/admin-forms.ts`) only to spare a round trip. Mastery
  thresholds are typed as percentages (one decimal) and sent as shares (three decimals); Arabic-
  Indic digits are accepted.
- Nothing is decided in the browser: whether a version can be published, whether a prerequisite
  closes a cycle, which status an exam may move to — the API answers, the screen shows it in Arabic.
- The tree is never patched locally. Every change refetches it; if another admin published the
  version meanwhile, the stale change's `TAXONOMY_VERSION_NOT_DRAFT` refetches it too and the
  screen turns read-only.
- Confirmations (publish, activate, archive) are inline, focus the confirm button and say what will
  happen. Submit and confirm buttons are disabled while their request is in flight.
- The question bank is open to `questions.create` (content managers and admins); review controls need
  `questions.review`, publish and archive `questions.publish`. Authors pick a taxonomy and skills
  from the API's authoring context, so they never need `taxonomy.manage`.
- The question editor never decides an answer key or mapping rule: "correct" is a checkbox for every
  type, and the API's `QUESTION_CONTENT_INVALID` rule codes are listed in Arabic
  (`src/lib/question-form.ts`). Changing the taxonomy version clears mappings with a note. Submitting
  for review is held back while the editor has unsaved changes. Every request is single-flight.
- Settings (`settings.manage`, admins) are saved as new versions with the version they were read at;
  a conflicting save shows the newer values and says so. Changing the level boundaries affects new
  diagnostics only — each session keeps the version it started under.

## Rules this app keeps

The visual system is documented in `DESIGN.md` and `PRODUCT.md` inside this app. The root
`UI_BRAND.md` remains the brand authority. `AppShell` provides active desktop/mobile navigation;
the landing page and authentication routes retain their public layout. Components share the
brand palette, spacing, form controls, state treatments and an authored stroke icon set.

- **No business rules here.** Grading, levels, strengths, access and prices are computed by the
  API and only displayed. Form schemas (`src/lib/auth-forms.ts`) only spare a round trip; the API
  validates again and is the authority.
- **No answer keys in the browser** — the API never sends them before an answer.
- **Returning from the payment page proves nothing.** `/payment/return` shows what the API reports,
  which changes only when the provider confirms the money.
- Question content is structured blocks rendered as text, never HTML.
- Server state lives in TanStack Query; errors are shown from the API's stable codes, in Arabic
  (`src/lib/messages.ts`), never as raw server text.
- Login opens `/dashboard`; registration opens the exam catalog. History query keys include
  the user id and page/filter, and authentication changes clear cached account data. Successful
  answer/skip submissions invalidate session history. The dashboard shows metadata/progress
  only; it does not expose the full paid skill report.
- Plans are shared between the preliminary result and `/subscriptions` through `PlanOffers`.
  Prices and entitlement status come from the API, and checkout sends only a plan id and an
  idempotency key. The interface explicitly identifies full diagnostic/training as still in
  development. A successful redirect is never treated as proof of payment.
- `/account` uses the existing `POST /auth/sessions/revoke` to sign out other devices; it does
  not change passwords, identity details or roles.
- New query keys include the current user id. Displayed result percentages remain the API's,
  and progress bars reflect finalized items rather than mastery.

## Environment

| Variable | Where | Meaning |
| --- | --- | --- |
| `API_INTERNAL_URL` | web server, run time | Base URL of the API. Required in production; `http://localhost:3000` in dev. |
| `PORT`, `HOSTNAME` | web server, run time | Listen address in the container (`3000`, `0.0.0.0`). |

## Not built yet

Math rendering (formulas show as their source), the full diagnostic and training screens, the
admin screens for questions, imports and users, and browser end-to-end tests.
