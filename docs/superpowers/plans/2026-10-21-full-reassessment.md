# Full Re-Diagnostic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A student who finished the full diagnostic can measure the whole exam again once a configurable gate (cooldown + training attempts) allows it, and compare the result with the previous measurement.

**Architecture:**
- Pure eligibility and comparison functions in the assessments domain.
- Diagnostic planning moves into its own service, shared by mini, full and the re-diagnostic.
- A `FullReassessmentService` serves status, start and result.
- The gate is a versioned setting.

**Tech Stack:** NestJS, Drizzle, Zod, Vitest, Next.js, TanStack Query, React Hook Form.

**Spec:** `docs/superpowers/specs/2026-10-21-full-reassessment-design.md`

## Global Constraints

- Setting key `assessment.fullReassessment.gate`; default `{ cooldownDays: 7, minTrainingAttempts: 30 }`.
- Error codes: `FULL_REASSESSMENT_REQUIRES_ACCESS` (403), `FULL_REASSESSMENT_NOT_ELIGIBLE` (409).
- No migration (the session type exists). No push, no deploy.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A student with an open re-diagnostic can always resume it, even after the gate or access
   changed.
2. The cooldown counts from the latest full measurement, the re-diagnostic included, so two cannot
   run back to back.
3. Training answers recorded before the last full measurement do not count.
4. The re-diagnostic never repeats a question inside itself, even when it reuses seen ones.
5. The result never shows another student's numbers, and never answer keys.

---

### Task 1: Domain, setting and planner

- [ ] Tests (`test/assessments/full-reassessment-domain.test.ts`, `test/assessments/next-step.test.ts`,
  `test/settings/setting-definitions.test.ts`, planner cases in the existing diagnostic-plan tests).
  RED.
- [ ] Implement `full-reassessment.ts`, `planDiagnostic` `seen`, `nextStep`
  `START_FULL_REASSESSMENT`, and the setting definition. GREEN. Commit.

### Task 2: API

- [ ] E2E `test/assessments/full-reassessment.e2e.test.ts`. RED.
- [ ] Implement:
  - extract `DiagnosticSessions`;
  - `FullReassessmentService`;
  - the store method;
  - errors, routes and the dashboard wiring.
- [ ] GREEN, then the full suite. Update API_CONTRACTS. Commit.

### Task 3: Web

- [ ] Tests (`test/full-reassessment.test.ts`; updates to next-step, diagnostics and settings tests). RED.
- [ ] Implement:
  - the client and texts;
  - the start and result pages;
  - the runner titles;
  - the next step;
  - the profile card;
  - the admin gate form.
- [ ] GREEN. Commit.

### Task 4: Docs, gates, browser

- [ ] Docs:
  - OPEN_QUESTIONS #12g (and #9a's note);
  - IMPLEMENTATION_STATUS;
  - WORKFLOWS §6;
  - README of the web app.
- [ ] Gates. Browser pass (desktop + 375 px). Commit. Self-review.
