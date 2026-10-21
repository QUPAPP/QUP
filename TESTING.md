# Testing Strategy

## Test Layers

### Unit
- mastery evidence.
- confidence.
- state transitions.
- gap priority.
- target difficulty.
- candidate scoring.
- permission policies.
- parser normalization.

### Integration
- Drizzle repositories.
- transactions.
- unique constraints.
- outbox.
- Redis/BullMQ adapters.
- object storage.
- payment adapters.
- AI structured output adapters.

### API
- auth.
- authorization.
- validation.
- idempotency.
- stable errors.

### E2E
Critical flows:
- register → mini diagnostic.
- purchase → entitlement → continue diagnostic.
- answer → mastery update → next action.
- import → review → publish.
- reassessment → mastered.
- permission denial.

## Mastery Engine Cases

Test:
- correct easy/hard.
- wrong easy/hard.
- hint.
- timeout.
- skip.
- answer revealed.
- repeat factor.
- primary/secondary attribution.
- low evidence cannot master.
- reassessment gate/failure.

Property checks:
- mastery ∈ [0,1].
- confidence ∈ [0,1].
- positive Evidence cannot reduce alpha.
- duplicate attempt cannot create second mastery event.
- history remains readable after archive/version changes.

## Concurrency

Simulate:
- same answer submitted simultaneously twice.
- two attempts updating same skill.
- payment webhook replay.
- duplicate publish commands.
- import worker retry.

Expected: no duplicate evidence/entitlement and consistent final state.

## Security Tests

- Student A cannot read B session.
- Content Manager cannot edit billing.
- question payload does not leak answer.
- forged `isCorrect` ignored.
- malicious upload rejected.
- invalid payment signature rejected.

## Import Fixtures

Per supported format:
- valid.
- malformed.
- duplicate.
- missing correct answer.
- unknown taxonomy.
- RTL Arabic.
- embedded images where supported.
- max limit / over limit.

## CI Gates

Minimum:
- format check.
- lint.
- typecheck.
- unit.
- integration.
- build.
- selected E2E.
- migration validation.
- security/dependency scanning as configured.

## Bug Rule

Every bug fix gets a regression test unless impossible; document exceptions.

## Session history verification

- API integration coverage: `apps/api/test/assessments/assessments.e2e.test.ts`, group
  `student session history`. Requires `TEST_DATABASE_URL`; checks authentication, strict
  pagination/filter validation, caller ownership, finalized progress including skips, archived
  exams, timestamp ties and empty/out-of-range pages.
- Boundary tests: `apps/api/test/assessments/history-query.test.ts`.
- Client tests: `apps/web/test/assessment-history-client.test.ts`.
- Browser smoke checked against the production web build on 2026-10-17 with mocked API responses:
  page navigation, filter resets pagination, empty/error/retry states, the 390px mobile layout,
  resume by exact session id without creating a new diagnostic, result links, expired-session
  sign-in links without cached history, and redirect to login without a session.
  This complements the real API integration tests; it is not a
  live payment-provider or complete browser-to-database test.

## Student interface redesign verification

The 2026-10-17 redesign adds navigation boundary tests and account/access client tests. Run
`pnpm --filter @qup/web test` (33 tests), `pnpm typecheck`, `pnpm check`, and `pnpm build`.

Browser checks used fixtures at the network boundary, with real rendered pages and interactions:

- Public landing, login/registration, password visibility and successful login navigation.
- Dashboard pagination, filter reset, empty/error/retry states and exact-session resume.
- Answer submission, feedback and advancing to the next saved item.
- Plans fetched per exam, checkout idempotency header, provider-disabled failure, empty catalog
  and existing-access states.
- Account information and confirmed other-device session revocation.
- Custom 404, one main/primary heading per page, RTL, no horizontal overflow at 320/390/1440px,
  and reduced-motion token behavior (CSS tooling may normalize `0ms` to `0s`).

Screenshots and the local CLI smoke script are under the ignored `output/playwright/` directory.
These are UI checks, not evidence of a completed full diagnostic or a real Stream payment.

## Hardening verification (C4, 2026-10-21)

- **Security, automated:**
  - client address: forged `X-Forwarded-For`, a valid and an invalid proxy secret, a malformed
    address (`apps/api/test/auth/client-address.e2e.test.ts`);
  - `TRUST_PROXY` and secret configuration;
  - proxy header allow-lists and the cross-site write decision table (`apps/web/test/api-proxy.test.ts`);
  - the CSP builder (`apps/web/test/csp.test.ts`).
- **Security, by hand on a production build:**
  - every script carries the nonce, with no console violations;
  - a cross-site `POST` gets `403 CROSS_SITE_REQUEST`, and a same-origin one reaches the API.
- **Dependencies:** `pnpm audit --prod` must be clean.
- **Backups:** `scripts/backup-restore-check.sh <url>` restores a dump into a scratch database and
  compares every table. Run it against the local database (RUNBOOK.md §9).
- **Performance:** `pnpm --filter @qup/api perf` (`PERF_STUDENTS` for more load). The p95 answer
  latency must stay under 500 ms. Baselines are in RUNBOOK.md §10.
- **Accessibility and devices** (production build, 375 px):
  - pages: dashboard, exams, skill profile, subscriptions, account, assessment runner, admin
    question version, imports, AI and analytics;
  - checks: no horizontal overflow, one `h1`, labelled controls, named buttons and links,
    keyboard-only answering.

  Focus loss in the runner was found and fixed. The web app has no component-test tooling, so
  that fix is verified in the browser only.

