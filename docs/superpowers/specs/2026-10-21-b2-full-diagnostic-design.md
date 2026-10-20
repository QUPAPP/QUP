# B2 — Full diagnostic and diagnostic blueprints

Date: 2026-10-21. Branch: `ahmeddev`. Executed under the standing instruction to continue the
roadmap without per-step approval; every product rule this slice has to assume is recorded in
`OPEN_QUESTIONS.md` (#9, #9a) instead of being buried in code.

## Why

PRD §6 puts the full diagnostic straight after purchase: "Purchase Exam Package → Continue Full
Diagnostic → Skill Profile". PRD §3 and §7 add that it continues the mini diagnostic "دون خسارة
Evidence السابق". Today a paid student has no way to measure the skills the mini diagnostic did not
reach, so the skill profile (B1) stays mostly UNASSESSED. `IMPLEMENTATION_STATUS.md` lists "التشخيص
الكامل … وإدارة blueprints" as the next priority.

## What a student gets

1. A paid student opens `/exams/:examId/full-diagnostic` — from the subscribed result page, the skill
   profile, or the exam card.
2. The API creates (or resumes) one `FULL_DIAGNOSTIC` session. Its questions **complete** what the
   student has already answered in this exam: the blueprint's question count is the total for
   the whole diagnosis, the questions the student already answered count towards it, and the new
   session holds the rest, so a student who finished the 12-question mini diagnostic answers 28
   more out of a 40-question full diagnostic.
3. Answering works exactly like the mini diagnostic: same endpoints, idempotent submit, evidence
   per answer, resume at the next unanswered item.
4. On completion the student lands on the skill profile.
5. Without access the page explains that the full diagnostic is part of the subscription and links
   to `/subscriptions`. After completing it, the page says so and links to the skill profile. There
   is no auto-redirect, so it never loops.

## What an admin gets

A blueprint is the recipe for one kind of diagnostic in one exam (`DOMAIN_MODEL.md`: "قواعد تكوين
اختبار أو جلسة تقييم"). In V1 an admin can, under the new `blueprints.manage` permission (ADMIN
only):

- list an exam's blueprints, on the exam's admin page;
- create a DRAFT for `MINI_DIAGNOSTIC` or `FULL_DIAGNOSTIC`, with code, name and question count —
  it is pinned to the exam's published taxonomy version;
- edit the DRAFT: name, question count, and a weight per domain (empty = the taxonomy's own weight);
- activate it: DRAFT → ACTIVE, and the exam's previous ACTIVE blueprint of the same type is archived
  in the same transaction;
- archive it.

ACTIVE and ARCHIVED blueprints are read-only, because sessions reference them and history must stay
explainable. To change a live recipe, the admin creates and activates a new draft.

## Rules

| Rule | Value | Source |
| --- | --- | --- |
| Full diagnostic size with no active blueprint | 40 questions in total, including already-answered ones | assumed, OPEN_QUESTIONS #9a |
| Mini diagnostic size with no active blueprint | 12 | decided, #10 |
| Target difficulty | 0.5 for both diagnostics (fixed form, as the mini) | assumed, #9a |
| Already answered | distinct questions with an ANSWERED attempt in any session of this exam, counted towards their primary skill (a subskill counts for its skill) | assumed, #9a |
| Allocation | total split over domains by weight (blueprint override or taxonomy weight), then over skills by skill weight; each skill gets `max(0, share − already answered)` new questions, closest to the target difficulty, never a question already given | extends the mini rule, #10a |
| Access | `403 FULL_DIAGNOSTIC_REQUIRES_ACCESS` without an active entitlement when starting; a started session can be finished even if access lapses | PRD §7; assumed |
| One per exam | an open session is resumed; a completed one is `409 FULL_DIAGNOSTIC_ALREADY_COMPLETED` with `details.sessionId`. Re-diagnostic (7-day cooldown, PRD §8) is a later slice. | mirrors #10a |
| Stale blueprint | an ACTIVE blueprint whose taxonomy version is no longer the published one is ignored (defaults apply, warning logged) | assumed |
| Blueprint question count | 1–200; stored as `max_questions`, with `min_questions = 1` (proceed with what is available, as the mini does) | assumed |
| Time limit | not offered in V1 (column stays null) | YAGNI |

Sessions record the blueprint they were planned from (`assessment_sessions.blueprint_id`).

## API

Admin (`blueprints.manage`):

```text
GET  /admin/exams/:examId/blueprints      { items: BlueprintSummary[] } newest first
POST /admin/exams/:examId/blueprints      { type, code, name, questionCount } → 201 Blueprint
GET  /admin/blueprints/:id                Blueprint (with domains and their weights)
PATCH /admin/blueprints/:id               { name?, questionCount?, domainWeights? } DRAFT only
POST /admin/blueprints/:id/activate       DRAFT → ACTIVE (audited)
POST /admin/blueprints/:id/archive        DRAFT|ACTIVE → ARCHIVED (audited)
```

`Blueprint = { id, examId, taxonomyVersion: { id, versionCode, status }, type, code, name,
questionCount, status, createdAt, updatedAt, domains: [{ id, name, taxonomyWeight, weight | null }] }`.

Errors: `EXAM_NOT_FOUND` 404, `EXAM_HAS_NO_PUBLISHED_TAXONOMY` 422, `BLUEPRINT_NOT_FOUND` 404,
`BLUEPRINT_CODE_TAKEN` 409, `BLUEPRINT_NOT_EDITABLE` 409, `BLUEPRINT_DOMAIN_UNKNOWN` 422 (a weight
for a domain outside the pinned version), `BLUEPRINT_WEIGHTS_EMPTY` 422 (every effective weight is
0), `BLUEPRINT_TAXONOMY_NOT_PUBLISHED` 409 (activation of a draft whose version was replaced).

Student:

```text
POST /exams/:examId/assessments/full-diagnostic   201 new · 200 resumed
```

`EXAM_NOT_AVAILABLE` 404, `FULL_DIAGNOSTIC_REQUIRES_ACCESS` 403,
`FULL_DIAGNOSTIC_ALREADY_COMPLETED` 409, `NO_QUESTIONS_AVAILABLE` 422 (nothing left to ask). It
returns the same session view as the mini diagnostic, and every other session endpoint applies.

## Architecture

- `assessments` owns blueprints (ERD "Assessment"):
  - `domain/blueprint.ts` holds the rules: lifecycle guards, question-count bounds, effective weights;
  - `application/blueprints.service.ts`;
  - `infrastructure/drizzle-blueprint-store.ts`, whose activation transaction archives the previous
    blueprint and writes the audit;
  - `presentation/admin-blueprints.controller.ts`.
- `domain/mini-diagnostic-plan.ts` becomes `domain/diagnostic-plan.ts` with
  `planDiagnostic({ domains, size, targetDifficulty, random, answered })`. With an empty
  `answered` it behaves exactly as today, so the existing tests carry over.
- `AssessmentStore` changes:
  - it gains `activeBlueprint(examId, type)` and `answeredQuestionVersionIds(studentId, examId)`;
  - `miniDiagnosticSize` is replaced;
  - `createSession` takes `blueprintId`.
- Catalog contract: `TaxonomyOutline.domains[].weight` (added), used for the blueprint view.
- Migration `0012_blueprints_permission.sql` (data only): `blueprints.manage` granted to ADMIN.
- Web:
  - API types and calls;
  - `/exams/:examId/full-diagnostic`;
  - `/assessments/:id` generalised to both diagnostic types, with the runner given its completion
    target;
  - the subscribed result page and the profile link to the full diagnostic;
  - the history links a completed full diagnostic to the profile;
  - admin: a blueprints section on `/admin/exams/:examId` and `/admin/blueprints/:id`.

## Testing

- Unit:
  - `planDiagnostic` with answered counts: none, partial, a skill already over its share, nothing
    left;
  - blueprint rules: editable only as DRAFT, count bounds, effective weights, empty weights.
- E2E (API):
  - blueprint CRUD, permissions (student and content manager get 403), activation archiving the
    previous blueprint, the audit row, stale-version activation refused;
  - full diagnostic:
    - 401 when signed out, 403 without access;
    - resume returns the same session;
    - it excludes questions already given and continues from the mini's answered count;
    - the blueprint's size and domain weights are honoured;
    - a stale blueprint is ignored;
    - completing it leads to 409 on the next start;
    - another student's states are untouched.
- Web unit: client paths, the session-type labels and the completion target.
- Browser: an admin creates, edits and activates a full-diagnostic blueprint; a paid student runs
  the full diagnostic to the profile; an unpaid student sees the paywall.
