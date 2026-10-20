# B5 Student Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/dashboard` answers where the student stands in each exam, and what to do next, with a server-chosen next step.

**Architecture:** A pure `nextStep` rule and a `StudentDashboardService` in assessments, built on the catalog, billing and mastery contracts. One `GET /me/dashboard`. Exam cards on the web.

**Tech Stack:** NestJS, Drizzle, PostgreSQL, Vitest, Next.js, TanStack Query.

**Spec:** `docs/superpowers/specs/2026-10-21-b5-student-dashboard-design.md`

## Global Constraints

- `DASHBOARD_DEFAULTS`: `improvementWindowDays: 7`, `strengths: 2`, `gaps: 3`, `improvements: 3`.
  No inline numbers.
- `standing` is null without access (PRD §7).
- No migration.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No push.

## Review Focus

1. A student with sessions in an exam that is no longer ACTIVE does not get a card for it, and the
   endpoint does not error.
2. When a session is open in one exam, other exams' next steps are unaffected.
3. Improvements only count the student's own evidence, and only on the exam's nodes.
4. A paid exam with no published taxonomy (impossible for ACTIVE exams, but guarded) yields a null
   standing, not a 500.
5. The web never computes the next step. It only maps the server's step to a link.

---

### Task 1: Next-step rule

**Files:** create `apps/api/src/modules/assessments/domain/next-step.ts`; test it in `apps/api/test/assessments/next-step.test.ts`.

**Produces:** `nextStep(input: NextStepInput): NextStep`, with the types from the spec.

- [ ] Table tests: every branch, and precedence (an open session beats everything; no access beats
  full diagnostic).
- [ ] FAIL → implement → PASS → commit together with Task 2.

### Task 2: Dashboard API

**Files:**
- catalog contract and lookup: `activeExams()`;
- mastery contract and reader: `recentChanges`;
- assessments:
  - ports and store: `openSessions`, `completedTypes`;
  - `application/student-dashboard.service.ts`;
  - `presentation/me.controller.ts`;
  - config;
- test: `apps/api/test/assessments/dashboard.e2e.test.ts`.

- [ ] E2E for every API case in the spec's Testing list.
- [ ] FAIL → implement → PASS + API suite. Update API_CONTRACTS.
- [ ] Commit `Add the student dashboard API`.

### Task 3: Dashboard screen

**Files:**
- `lib/api.ts`: `getDashboard` and its types;
- create `lib/next-step.ts`, `components/exam-progress-card.tsx`;
- modify `app/dashboard/page.tsx` and CSS;
- test: `apps/web/test/dashboard.test.ts`.

- [ ] Tests:
  - client path;
  - `nextStepLink` for every type;
  - the improvement text in percentage points.
- [ ] Implement → tests, typecheck, Biome → commit `Add the student dashboard`.

### Task 4: Docs, gates, browser

- [ ] Docs:
  - OPEN_QUESTIONS #12f;
  - IMPLEMENTATION_STATUS (B5);
  - README.
- [ ] Gates. Browser pass on the local student.
- [ ] Commit, then self-review.
