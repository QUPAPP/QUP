# B1 — Student Skill Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A student with access sees every skill's mastery state, measured coverage and ranked gaps.

**Architecture:** Pure gap/aggregation rules in `@qup/adaptive-engine` (`profile.ts`); a read model in the `mastery` module (states reader → service → student controller) that reads the taxonomy through a new catalog contract method and access through `EXAM_ACCESS`; one student page.

**Spec:** `docs/superpowers/specs/2026-10-21-b1-skill-profile-design.md`

## Global Constraints

- Engine stays pure (no I/O); every number from `MasteryConfig` or node settings — no inline thresholds.
- Students read only their own states; access is checked on the server; the prior is never shown as a level.
- No migration. Commits on `ahmeddev`; no push.

## Review Focus

1. **Student with access but no evidence yet:** every skill UNASSESSED, `mastery: null`, no gaps — an encouraging empty state, not zeros (Task 4).
2. **Access expires:** the next request is `403`; the page shows the paywall (Task 3/4).
3. **A skill whose subskills are partly measured:** mastery from measured ones only, coverage counts unmeasured as 0 (Task 1).
4. **A student's states for another exam or an old taxonomy version:** never included (Task 3).

### Task 1: Engine profile rules
**Files:** create `packages/adaptive-engine/src/profile.ts`; export from `index.ts`; test `packages/adaptive-engine/test/profile.test.ts`.
**Produces:** `gapSeverity(node: { masteryScore; confidenceScore; evidenceCount; state }, threshold: number, config): number | null`; `aggregateSkill(children: { node: NodeMastery; weight: number }[], settings: NodeSettings, config): NodeMastery`; `rankGaps<T extends { severity: number; order: number }>(gaps: T[]): T[]`.
- [ ] Table tests: gap below threshold with confidence → severity; below minConfidence → null; UNASSESSED → null; MASTERED → null; at/above threshold → null; aggregation: none assessed → UNASSESSED; partly measured mastery/coverage; all MASTERED → MASTERED; property: severity ∈ (0, 1]. FAIL → implement → PASS; commit `Add skill profile rules to the mastery engine`.

### Task 2: Catalog contract — profile taxonomy
**Files:** `apps/api/src/modules/catalog/catalog.contract.ts` (`ProfileTaxonomy`, `profileTaxonomy(examId)`), `drizzle-catalog-lookup.ts`.
**Produces:** `ProfileTaxonomy = { domains: { id; name; order; skills: { id; name; order; weight; masteryThreshold; minCoverage; subskills: { id; name; weight; masteryThreshold }[] }[] }[] }` for the exam's PUBLISHED version, ACTIVE nodes, display order; null when none.
- [ ] Implemented and exercised by Task 3's e2e (no N+1: four queries). Commit with Task 3.

### Task 3: Mastery read model and route
**Files:** create `apps/api/src/modules/mastery/infrastructure/drizzle-mastery-reader.ts` (`statesFor(studentId, examId)`), `application/skill-profile.service.ts`, `presentation/skill-profile.controller.ts`, `domain/mastery.errors.ts` (`SkillProfileRequiresAccess` 403 `SKILL_PROFILE_REQUIRES_ACCESS`); modify `mastery.module.ts` (imports `CatalogModule`, `BillingModule`); test `apps/api/test/mastery/skill-profile.e2e.test.ts`.
- [ ] E2E: unauthenticated 401; no entitlement 403 code; inactive exam 404 `EXAM_NOT_AVAILABLE`; with entitlement after a diagnostic: states present, unmeasured skills `mastery: null`, a skill with subskills aggregated, gaps sorted by severity, another student's states absent. FAIL → implement → PASS + API suite; API_CONTRACTS.md; commit `Add the student skill profile`.

### Task 4: Web profile page
**Files:** `apps/web/src/lib/api.ts` (types + `getSkillProfile`), `apps/web/src/lib/mastery-labels.ts` (`MASTERY_STATE_LABELS`, `coverageText`), `apps/web/src/app/exams/[examId]/profile/page.tsx`, link on `apps/web/src/app/exams/page.tsx`; CSS; tests `apps/web/test/skill-profile.test.ts`.
- [ ] Tests: client path; every state has an Arabic label; `coverageText` words. Implement page (summary, gaps, domains, paywall, empty state). Commit `Add the student skill profile page`.

### Task 5: Docs, gates, browser
- [ ] README, IMPLEMENTATION_STATUS (B1), OPEN_QUESTIONS #12c (the aggregation assumptions). Gates. Browser: paid student (grant entitlement locally) and unpaid. Commit; self-review.
