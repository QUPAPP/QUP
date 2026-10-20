# B2 Full Diagnostic and Blueprints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A paid student completes a full diagnostic that continues from what they already answered, and an admin manages the diagnostic blueprints that size and weight it.

**Architecture:** The assessments module owns blueprints. A pure planner gets an `answered` count per skill. The store reads the active blueprint and the student's answered questions. The web reuses the mini diagnostic runner for both types.

**Tech Stack:** NestJS + Fastify, Drizzle, PostgreSQL, Zod, Vitest, Next.js App Router, TanStack Query, React Hook Form.

**Spec:** `docs/superpowers/specs/2026-10-21-b2-full-diagnostic-design.md`

## Global Constraints

- Defaults:
  - full diagnostic 40 questions in total, including questions already answered;
  - mini diagnostic 12;
  - target difficulty 0.5;
  - blueprint question count 1–200.
  These are named constants in `assessment-config.ts` and `blueprint.ts`, never inline numbers.
- Stable error codes exactly as the spec lists them. No business rule in controllers or React.
- Arabic RTL copy, and every message comes from an error code.
- Migrations are additive and run locally only.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No push.

## Review Focus

1. A student who already answered more questions on a skill than its share gets no new questions
   there, and the other skills still get theirs.
2. Activation is racy: two drafts activated at once must leave exactly one ACTIVE blueprint per
   exam and type, enforced by a partial unique index in migration 0012.
3. A blueprint pinned to an archived taxonomy version is never used to plan a session.
4. The full-diagnostic start route never reveals another student's session or states.
5. The web never shows an editable form for a non-DRAFT blueprint.

---

### Task 1: Planner with already-answered questions

**Files:**
- Rename: `domain/mini-diagnostic-plan.ts` → `domain/diagnostic-plan.ts`
  (`planMiniDiagnostic` → `planDiagnostic`).
- Modify: `application/assessments.service.ts` (import).
- Test: `apps/api/test/assessments/assessments-domain.test.ts`.

**Produces:**
`planDiagnostic(input: { domains; size; targetDifficulty; random; answered?: ReadonlyMap<string, number> }): PlannedItem[]`.
For each skill:
- capacity = answered + distinct candidates;
- slots = apportion over domains, then over skills;
- new items = max(0, slots − answered).

- [ ] Tests, with existing cases renamed:
  - no `answered` → unchanged;
  - answered 3 of a skill's 5-slot share → 2 new;
  - a skill answered beyond its share → 0 new, while others are unaffected;
  - every share already answered → [].
- [ ] FAIL → implement → PASS → commit `Let the diagnostic planner continue from answered questions`.

### Task 2: Blueprint management API

**Files:**
- Create:
  - `packages/db/migrations/0012_blueprints_permission.sql` (`blueprints.manage` → ADMIN; partial
    unique index `assessment_blueprints_one_active` on (exam_id, type) WHERE status = 'ACTIVE'),
    plus schema index and snapshot;
  - `assessments/domain/blueprint.ts`;
  - `application/blueprints.service.ts`;
  - `infrastructure/drizzle-blueprint-store.ts`;
  - `presentation/admin-blueprints.controller.ts`.
- Modify:
  - `rbac/permissions.ts` (`BlueprintsManage`);
  - `audit-log.ts` (`BlueprintActivated: "blueprint.activate"`, `BlueprintArchived: "blueprint.archive"`);
  - `catalog.contract.ts` and `drizzle-catalog-lookup.ts` (`TaxonomyOutline.domains[].weight`);
  - `assessments.module.ts`;
  - `assessment.errors.ts`.
- Test: `apps/api/test/assessments/blueprints.e2e.test.ts`; unit tests in
  `apps/api/test/assessments/blueprint.test.ts`.

**Produces:**
- `BLUEPRINT_QUESTION_COUNT = { min: 1, max: 200 }`;
- `assertEditable(status)`;
- `effectiveDomainWeights(domains, overrides)`;
- the routes in the spec.

- [ ] Unit:
  - DRAFT is editable, ACTIVE and ARCHIVED are not;
  - effective weight = override ?? taxonomy weight;
  - all zero → `BLUEPRINT_WEIGHTS_EMPTY`.
- [ ] E2E:
  - 401 when signed out; 403 for a student and for a content manager;
  - create → DRAFT pinned to the published version;
  - duplicate code → 409;
  - patch name/count/weights;
  - unknown domain → 422;
  - patch an ACTIVE blueprint → 409;
  - activate archives the previous blueprint and writes the audit;
  - activating a draft whose version is no longer published → 409;
  - archive.
- [ ] FAIL → implement → PASS + API suite. Update API_CONTRACTS.md. Commit `Add diagnostic blueprint management`.

### Task 3: Full diagnostic API

**Files:**
- Modify:
  - `domain/ports.ts`:
    - `activeBlueprint(examId, type): Promise<ActiveBlueprint | null>`;
    - `answeredQuestionVersionIds(studentId, examId): Promise<string[]>`;
    - `createSession` takes `blueprintId: string | null`;
    - `miniDiagnosticSize` is removed;
  - `drizzle-assessment-store.ts`;
  - `assessments.service.ts` (`startFullDiagnostic`; the mini diagnostic also uses `activeBlueprint`);
  - `assessments.controller.ts` (`POST /exams/:examId/assessments/full-diagnostic`);
  - `assessment.errors.ts` (`FullDiagnosticRequiresAccess`, `FullDiagnosticAlreadyCompleted`);
  - `assessment-config.ts` (`FULL_DIAGNOSTIC_DEFAULTS`).
- Test: `apps/api/test/assessments/full-diagnostic.e2e.test.ts`.

**Produces:** `ActiveBlueprint = { id; taxonomyVersionId; questionCount; domainWeights: Map<string, number> }`.

- [ ] E2E:
  - 401 when signed out; 403 code without access;
  - 201, then 200 resume with the same id;
  - with a completed mini of N answered questions, the session has 40 − N items (enough content
    seeded) and none of them was in the mini;
  - an active FULL blueprint with count 6 and one domain weighted 0 → items only from the other
    domain, total 6 − answered;
  - a stale blueprint (pinned version archived) is ignored;
  - after completion → 409 with `details.sessionId`;
  - the mini diagnostic records `blueprint_id` when its active blueprint applies.
- [ ] FAIL → implement → PASS + API suite. Update API_CONTRACTS.md. Commit `Add the full diagnostic`.

### Task 4: Student web

**Files:**
- `apps/web/src/lib/api.ts`: `startFullDiagnostic`.
- `apps/web/src/lib/diagnostics.ts`: `DIAGNOSTIC_TITLES` and
  `completionHref(session: { id; type; examId })`; the mini goes to `/assessments/:id/result` and
  the full diagnostic to `/exams/:examId/profile`.
- Create `app/exams/[examId]/full-diagnostic/page.tsx`.
- Modify:
  - `app/assessments/[sessionId]/page.tsx`;
  - `components/assessment-questions.tsx` (`completedHref` prop);
  - `app/assessments/[sessionId]/result/page.tsx` (subscribed → link to the full diagnostic);
  - `app/exams/[examId]/profile/page.tsx` (action link);
  - `components/assessment-history.tsx`.
- Test: `apps/web/test/full-diagnostic.test.ts`.

- [ ] Tests:
  - the client path;
  - `completionHref` for both types;
  - every diagnostic type has a title.
- [ ] Implement → web tests, typecheck, Biome → commit `Add the full diagnostic screens`.

### Task 5: Admin web

**Files:**
- `apps/web/src/lib/blueprint-api.ts`;
- `apps/web/src/lib/blueprint-form.ts`: Zod schema, `toUpdateBody`;
- `components/admin/blueprints-section.tsx` (list + create on `/admin/exams/:examId`);
- `app/admin/blueprints/[blueprintId]/page.tsx` (view, DRAFT form, activate/archive with
  `ConfirmAction`);
- `src/lib/permissions.ts` (`blueprints.manage`).
- Test: `apps/web/test/blueprint-form.test.ts`.

- [ ] Tests:
  - an empty weight sends `null`;
  - the count is out of range below 1 and above 200;
  - client paths.
- [ ] Implement → tests, typecheck, Biome → commit `Add blueprint management screens`.

### Task 6: Docs, gates, browser

- [ ] Docs:
  - OPEN_QUESTIONS #9a (assumed defaults);
  - IMPLEMENTATION_STATUS (B2 section, priorities);
  - apps/web/README;
  - ERD note on the partial unique index.
- [ ] Gates: `pnpm typecheck && pnpm check && pnpm test && pnpm build`.
- [ ] Browser:
  - admin blueprint flow;
  - a paid student's full diagnostic ending on the profile;
  - an unpaid student sees the paywall;
  - a 375px layout.
- [ ] Commit. Self-review.
