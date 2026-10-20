# B4 Skill Reassessment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A student whose skill is READY_FOR_REASSESSMENT takes a 5-question reassessment that can make the skill MASTERED. A failure holds the skill until 5 new answers.

**Architecture:**
- Pure pass and hold rules live in `@qup/adaptive-engine`.
- Mastery owns outcomes (`skill_reassessments`) and applies the hold in `standing()`.
- Adaptive plans the questions.
- Assessments runs the session and records the outcome on completion.

**Tech Stack:** TypeScript, NestJS + Fastify, Drizzle, PostgreSQL, Vitest, fast-check, Next.js.

**Spec:** `docs/superpowers/specs/2026-10-21-b4-reassessment-design.md`

## Global Constraints

- `REASSESSMENT_CONFIG_V1`:
  - `configVersion: "reassessment-config-v1.0"`;
  - `questionCount: 5`;
  - `passRatio: 0.8`;
  - `retryAfterAttempts: 5`.
- Migration `0014_skill_reassessments.sql` is additive and runs locally only.
- MASTERED is set only by a passed reassessment and is never cleared by evidence (#12a).
- Stable codes:
  - `REASSESSMENT_REQUIRES_ACCESS`;
  - `SKILL_NOT_FOUND`;
  - `SKILL_NOT_READY_FOR_REASSESSMENT`;
  - `REASSESSMENT_NOT_ENOUGH_QUESTIONS`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No push.

## Review Focus

1. Recording the outcome twice (completion plus a result read, or two reads at once) yields one
   row and one set of MASTERED marks.
2. A hold must not hide a MASTERED skill, and it must not apply after a pass.
3. A reassessment of a skill with subskills marks every weighted subskill MASTERED, so the
   aggregate reads MASTERED.
4. Starting a reassessment never reveals another student's standing; another student's session is a
   404.
5. Diagnostics, training and their completion are unchanged.

---

### Task 1: Engine reassessment rules

**Files:** create `packages/adaptive-engine/src/reassessment.ts`, export it, and test it in
`test/reassessment.test.ts`.

**Produces:**
- `REASSESSMENT_CONFIG_V1`, `ReassessmentConfig`;
- `requiredCorrect(total, config): number`;
- `reassessmentPassed(input: { correct; total; readyAfter: boolean }, config): boolean`;
- `holdRemaining(input: { failed: boolean; attemptsSince: number }, config): number | null` (null = no
  hold).

- [ ] Tables:
  - 5 → 4;
  - 4/5 ready → pass;
  - 4/5 not ready → fail;
  - 3/5 → fail;
  - hold: 5, then 0 → null; a pass → null.
- [ ] Property: `requiredCorrect` is in [1, total] when total ≥ 1.
- [ ] FAIL → implement → PASS → build → commit `Add reassessment rules to the engine`.

### Task 2: Reassessment API

**Files:**
- migration 0014:
  - `skill_reassessments` in `packages/db/src/schema/mastery.ts`;
  - `assessment_sessions.target_skill_id`;
- mastery:
  - `mastery.contract.ts` (`REASSESSMENT_RECORDER`, `StandingSkill.reassessment`);
  - `infrastructure/drizzle-reassessment-store.ts`;
  - `standing()` hold;
  - the profile view field;
- adaptive: `planReassessment`;
- assessments:
  - ports and store (`targetSkillId` on the session; `createSession` takes it);
  - service: `startReassessment`, the completion hook, `reassessmentResult`;
  - controller routes;
  - errors;
- test cleanup: `skill_reassessments`;
- test: `apps/api/test/assessments/reassessment.e2e.test.ts`.

- [ ] E2E for every API case in the spec's Testing list.
- [ ] FAIL → implement → PASS + API suite. Update API_CONTRACTS.
- [ ] Commit `Add skill reassessment and the MASTERED state`.

### Task 3: Reassessment screens

**Files:**
- `lib/api.ts`: calls and types;
- `lib/diagnostics.ts`: `SKILL_REASSESSMENT` in the runner types, completion → `/assessments/:id/reassessment`;
- create:
  - `app/exams/[examId]/skills/[skillId]/reassessment/page.tsx`;
  - `app/assessments/[sessionId]/reassessment/page.tsx`;
- profile: button and hold note;
- history.

- [ ] Tests:
  - client paths;
  - completion target;
  - title;
  - the hold note text.
- [ ] Implement → tests, typecheck, Biome → commit `Add the skill reassessment screens`.

### Task 4: Docs, gates, browser

- [ ] Docs:
  - OPEN_QUESTIONS #12e (and update #12, #12a);
  - IMPLEMENTATION_STATUS;
  - README;
  - ERD.
- [ ] Gates. Browser: reassessment pass → MASTERED on the profile.
- [ ] Commit; self-review.
