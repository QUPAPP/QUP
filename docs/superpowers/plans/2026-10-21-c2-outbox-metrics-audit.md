# C2 Outbox, Metrics and Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Business transactions emit outbox events that a worker drains into the analytics stream. Admins read metrics, the audit log and adaptive decisions.

**Architecture:**
- An outbox writer and relay live in `src/infrastructure/outbox`.
- A projector handler lives in a new `analytics` module.
- A worker entry runs on a Nest application context.
- Read-only admin controllers: `audit` (logs, outbox status), `analytics` (metrics) and `adaptive`
  (decisions).

**Tech Stack:** NestJS, Drizzle, PostgreSQL (`FOR UPDATE SKIP LOCKED`), Vitest, Next.js, TanStack Query.

**Spec:** `docs/superpowers/specs/2026-10-21-c2-outbox-metrics-audit-design.md`

## Global Constraints

- `OUTBOX_CONFIG`:
  - `batchSize 50`;
  - `pollMs 2000`;
  - `maxAttempts 8`;
  - `baseBackoffMs 5000`;
  - `maxBackoffMs 600000`;
  - `staleProcessingMs 300000`.
- `ANALYTICS_DEFAULTS`: `windows [7, 30]`, `thinSkillQuestions 5`, `thinSkillsShown 20`.
- Events carry ids only, no names, emails or answers. Payload schema `"1"`.
- No migration: the tables exist.
- Admin reads require `audit.view`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No push.

## Review Focus

1. A rolled-back business transaction leaves no outbox row.
2. A handler that throws for one row does not stop the drain of the others.
3. Draining twice never duplicates `learning_events`.
4. The audit and decision endpoints never return answer keys or session cookies. Metadata is
   already redacted at write time.
5. The analytics queries stay bounded: each is a fixed number of queries, whatever the data size.

---

### Task 1: Outbox and worker

**Files:**
- `src/infrastructure/outbox/outbox.ts` (`OutboxEventType`, `writeOutbox`);
- `src/infrastructure/outbox/outbox-relay.ts` (`OutboxRelay`, `OUTBOX_HANDLERS`, `OutboxHandler`);
- `src/infrastructure/outbox/outbox.module.ts`;
- `modules/analytics/application/learning-event-projector.ts`, `modules/analytics/analytics.module.ts`;
- emitters:
  - assessments store (`recordAttempt`, `complete`);
  - the mastery reassessment store;
  - the import store (`updateBatch` when complete);
- `src/worker.ts`; the `worker` script; `.claude/launch.json` entry;
- tests: `apps/api/test/outbox/outbox.e2e.test.ts`.

- [ ] Integration tests for every relay case in the spec's Testing list.
- [ ] FAIL → implement → PASS + API suite.
- [ ] Commit `Add the transactional outbox and its worker`.

### Task 2: Admin read APIs

**Files:**
- `modules/audit/` (module, `audit-read.service.ts`, `admin-audit.controller.ts`: audit logs and
  outbox status);
- `modules/analytics/application/analytics.service.ts`, `presentation/admin-analytics.controller.ts`;
- `modules/adaptive/presentation/admin-decisions.controller.ts` plus a decision store read;
- test: `apps/api/test/admin/admin-reads.e2e.test.ts`.

- [ ] E2E for the spec's admin API list.
- [ ] FAIL → implement → PASS + suite. Update API_CONTRACTS.
- [ ] Commit `Add admin metrics, audit log and decision reads`.

### Task 3: Admin screens

**Files:**
- `lib/admin-insights-api.ts`;
- `lib/decision-labels.ts`;
- `app/admin/analytics/page.tsx`;
- `app/admin/audit/page.tsx`;
- `app/admin/adaptive-decisions/page.tsx`;
- the permissions nav (`auditView`);
- CSS;
- test: `apps/web/test/admin-insights.test.ts`.

- [ ] Tests:
  - client paths;
  - every reason code labelled;
  - the window is limited to 7 or 30.
- [ ] Implement → tests, typecheck, Biome → commit `Add the metrics, audit and decision screens`.

### Task 4: Docs, gates, browser

- [ ] Docs:
  - OPEN_QUESTIONS #19a;
  - IMPLEMENTATION_STATUS;
  - README;
  - OBSERVABILITY "V1";
  - DEPLOYMENT (the worker process).
- [ ] Gates. Browser pass.
- [ ] Commit, then self-review.
