# B3 Adaptive Training Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A paid student trains on the skill that needs it most. Every question is chosen at the moment it is needed, by pure engine rules, and recorded as an auditable decision.

**Architecture:**
- Pure selection rules live in `@qup/adaptive-engine`.
- A new `adaptive` API module orchestrates them through the mastery, catalog and question
  contracts.
- Assessments reuses its session primitives for `ADAPTIVE_TRAINING`. It appends one item at a time,
  together with its decision, in one transaction.

**Tech Stack:** TypeScript, fast-check, NestJS + Fastify, Drizzle, PostgreSQL, Vitest, Next.js, TanStack Query.

**Spec:** `docs/superpowers/specs/2026-10-21-b3-adaptive-training-design.md`

## Global Constraints

- Every number in the spec's rules table lives in `SELECTION_CONFIG_V1`
  (`configVersion: "selection-config-v1.0"`, `ADAPTIVE_ENGINE_VERSION = "adaptive-v1.0"`). No inline
  numbers.
- Training length is 10, stored per session (`planned_item_count`, migration 0013, additive, local
  only).
- The LLM never takes part.
- The review (correct keys and explanation) is returned only after the item is finalized, and only
  for training.
- Stable error codes: `TRAINING_REQUIRES_ACCESS`, `NOTHING_TO_TRAIN`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No push.

## Review Focus

1. Two concurrent `current-item` calls on a training session must create exactly one pending item
   and one decision.
2. A presented-but-unanswered item at early completion gives no evidence and never counts as
   answered.
3. The review must never appear before the attempt is stored, including on an idempotent replay
   of a different item's key.
4. When the target's candidates run out mid-session, the next call switches target or ends the
   session. It never errors.
5. A diagnostic session's behaviour is unchanged: no review, completion when all planned items are
   finalized.

---

### Task 1: Engine selection rules

**Files:** create `packages/adaptive-engine/src/selection.ts`; export it from `index.ts`; test it in
`packages/adaptive-engine/test/selection.test.ts`.

**Produces:**
- `SELECTION_CONFIG_V1`, `ADAPTIVE_ENGINE_VERSION`, `SelectionConfig`;
- `examWeightFactors(domains: { weight; skills: { id; weight }[] }[]): Map<string, number>`;
- `gapPriority(input: { severity; examWeightFactor; priorityWeight; prerequisiteBoost }): number`;
- `prerequisiteBoost(dependentGaps: number, config): number`;
- `chooseTarget(input: { skills: TargetSkill[]; current: { skillId; recentResults: boolean[] } | null }, config): TargetChoice | null`;
- `targetDifficulty(mastery: number | null, recentResults: boolean[], config): { value; reasons }`;
- `rankCandidates(candidates: SelectionCandidate[], targetDifficulty: number, config): { scored: ScoredCandidate[]; widened: boolean }`;
- `pickCandidate(scored: ScoredCandidate[], random: () => number, config): ScoredCandidate | null`.

- [ ] Table tests for every branch the spec lists.
- [ ] Properties:
  - `targetDifficulty` stays in [0.2, 0.9];
  - `pickCandidate` returns one of the top 3.
- [ ] FAIL → implement → PASS → build the engine → commit `Add adaptive selection rules to the engine`.

### Task 2: Contracts for selection and review

**Files:**
- catalog: `ProfileTaxonomy` gains domain `weight`, skill `priorityWeight` and
  `prerequisiteSkillIds` (`catalog.contract.ts`, `drizzle-catalog-lookup.ts`).
- mastery:
  - create `mastery.contract.ts` (`SKILL_STANDING_READER`, `SkillStanding`);
  - `SkillProfileService.standing()`;
  - module exports.
- questions: `DeliverableQuestion.explanation`.

- [ ] The existing skill-profile e2e stays green.
- [ ] Add an assertion to `skill-profile.e2e.test.ts` that the prerequisite ids come back through the
  standing reader. Use a unit-level call via `app.get(SKILL_STANDING_READER)`.
- [ ] Commit `Expose skill standing and training taxonomy to other modules`.

### Task 3: Adaptive module and training API

**Files:**
- migration `0013_training_sessions.sql` (`assessment_sessions.planned_item_count integer NULL`);
- create in `modules/adaptive`:
  - `adaptive.module.ts`;
  - `adaptive.contract.ts`;
  - `application/adaptive-selector.service.ts`;
  - `infrastructure/decision-writer.ts`;
- assessments:
  - `ports.ts`: `appendAdaptiveItem`, the session's `plannedItemCount`, `trainingContext`;
  - `drizzle-assessment-store.ts`;
  - `assessments.service.ts`: `startTraining`, the training branches;
  - the controller route;
  - errors: `TrainingRequiresAccess`, `NothingToTrain`;
  - `assessment-config.ts`: `TRAINING_DEFAULTS.questionCount = 10`;
- test: `apps/api/test/assessments/training.e2e.test.ts`.

- [ ] E2E, covering every API case in the spec's Testing list.
- [ ] FAIL → implement → PASS + full API suite. Update API_CONTRACTS.md.
- [ ] Commit `Add adaptive training with auditable decisions`.

### Task 4: Training screens

**Files:**
- `apps/web/src/lib/api.ts`: `startTraining`; the `CurrentItem.item.target` and
  `SubmitResult.review` types;
- `apps/web/src/lib/diagnostics.ts`: becomes the session-kind helpers for training too;
- create `app/exams/[examId]/training/page.tsx`;
- modify:
  - `app/assessments/[sessionId]/page.tsx`;
  - `components/assessment-questions.tsx`: target line, review panel, end button;
  - profile (action);
  - history;
  - CSS;
- test: `apps/web/test/training.test.ts`.

- [ ] Tests:
  - the client path;
  - the completion target for training;
  - the review shows the correct option labels from the keys.
- [ ] Implement → tests, typecheck, Biome → commit `Add the adaptive training screens`.

### Task 5: Docs, gates, browser

- [ ] Docs:
  - OPEN_QUESTIONS #12d;
  - IMPLEMENTATION_STATUS (B3);
  - README;
  - ADAPTIVE_ENGINE note on the version strings.
- [ ] Gates. Browser pass: a paid student trains, sees the review, ends the session, and the
  profile updates.
- [ ] Commit, then self-review.
