# Implementation Plan + Definition of Done

## Phase 0 — Foundation

Deliver:
- monorepo/toolchain.
- CI.
- architecture skeleton.
- config/env validation.
- DB/migrations.
- observability baseline.
- auth/RBAC foundation.
- test infrastructure.

Exit: clean build/test pipeline and clear module boundaries.

## Phase 1 — Exam & Content Core

Build:
- exams.
- taxonomy versions.
- domains/skills/subskills.
- prerequisites.
- question/version/options/mappings.
- reviews.
- admin taxonomy tree.
- manual question editor.

Tests:
- published version immutability.
- RBAC.
- prerequisite cycle prevention.
- answer redaction.

## Phase 2 — Import System

Build structured first:
- upload/private storage.
- import batches/items.
- XLSX/CSV/TSV/JSON.
- column mapper.
- validation/reporting.
- duplicate detection.
- review UI.

Then add DOCX/PDF/images incrementally.

## Phase 3 — Assessment Engine

- blueprints.
- mini diagnostic.
- session/item lifecycle.
- server grading.
- idempotent answers.
- resume.
- attempt history.

Prove assessment integrity before Adaptive complexity.

## Phase 4 — Mastery Engine V1

- pure evidence calculation package.
- confidence/state.
- persistence/history.
- concurrency protection.
- simulation/unit/property tests.

Connect Attempt → Mastery Event.

## Phase 5 — Adaptive Selection

- gap detection/priority.
- target difficulty.
- candidate filtering/scoring.
- top-N weighted selection.
- decision audit.
- adaptive session UI.

## Phase 6 — Reassessment

- eligibility.
- reassessment blueprint.
- pass/fail.
- mastered transition.
- gap closure.
- retry rules.
- full re-diagnostic eligibility.

## Phase 7 — Packages/Payments

- plan per exam.
- entitlement.
- payment interface.
- provider adapter after business decision.
- verified webhooks.
- preview → purchase → continue.

Can move earlier if commercial testing requires it.

## Phase 8 — AI Assistance

Only after deterministic core:
- AI gateway.
- prompt/run versioning.
- explanations.
- import structuring.
- metadata suggestions.
- question drafting + human review.

## Phase 9 — Dashboard/Analytics

- current level.
- strengths/gaps.
- next recommendation.
- improvement history.
- admin content/learning metrics.

## Phase 10 — Hardening

- security testing.
- load/performance profiling.
- backup restore test.
- observability alerts.
- accessibility.
- browser/device QA.
- production runbooks.

## First Vertical Slice

```text
Admin:
Exam → Domain → Skill → SubSkill → Question

Student:
Account → Mini Diagnostic → One Answer

System:
Attempt → Mastery Event → Updated Skill Profile
```

هذه أول نقطة تثبت أن Architecture تعمل End-to-End قبل بناء عشرات الشاشات.

# Definition of Done

A task is done only if applicable items pass.

## Product
- acceptance criteria satisfied.
- no hidden assumption against PRD.
- edge states handled.
- permissions defined.

## Code
- module boundaries respected.
- strict types.
- no magic business constants.
- errors intentional.
- no dead/debug code.

## Data
- migration included if needed.
- constraints/indexes reviewed.
- history compatibility considered.
- destructive data loss avoided.

## Security
- auth/authorization checked.
- ownership/IDOR tested.
- validation.
- sensitive response reviewed.
- upload/payment/AI concerns handled.

## Tests
- unit domain tests.
- integration when infra involved.
- API auth/validation.
- E2E for critical flow where warranted.
- regression test for bug fixes.

## Observability
- meaningful errors/logs.
- metrics/traces where critical.
- audit event for sensitive admin action.

## Documentation
- update PRD/domain/ERD/API/algorithm docs when behavior changes.

## Quality Gates
- format.
- lint.
- typecheck.
- tests.
- build.
- migration validation.

## Release
- changed files/risk summarized.
- no production deployment unless explicitly approved.
