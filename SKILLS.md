# SKILLS.md — Engineering Skills for QUP Agents

هذه Playbooks إلزامية لأي AI Agent يعمل على المشروع.

## Skill 01 — Requirements & Product Reasoning

```text
Request
→ Persona
→ Use Case
→ Domain Rule
→ Data Impact
→ Acceptance Criteria
→ Edge Cases
→ Security
→ Plan
```

لا تخترع متطلبات؛ assumptions يجب أن تكون ظاهرة.

## Skill 02 — Domain Modeling

استخدم المصطلحات الموحدة:
`Exam, Domain, Skill, SubSkill, Question, QuestionVersion, Assessment, Attempt, StudentSkillProfile, LearningGap, Mastery, Confidence, Reassessment, AdaptiveDecision`.

## Skill 03 — Modular Architecture

قبل إنشاء module حدّد:
- مسؤوليته.
- ما يملكه من بيانات.
- public application services.
- dependencies.
- كيف تمنع circular dependency.

## Skill 04 — Data Modeling & Migrations

لكل تغيير:
- invariant.
- FK/unique/index.
- migration.
- backfill.
- historical compatibility.

لا تحذف Question/Skill مستخدمة؛ archive/version.

## Skill 05 — Adaptive Learning Engineering

- no LLM mastery.
- algorithm versioning.
- simulations/tests.
- scoring منفصل عن question selection.
- no response-time scoring in V1.
- repeated-question penalty.
- confidence/coverage guards.

## Skill 06 — Secure API Design

لكل endpoint اسأل:
- من يستطيع استدعاءه؟
- من يملك المورد؟
- هل يمكن IDOR؟
- ما validation؟
- هل العملية idempotent؟
- هل response تكشف بيانات حساسة؟
- هل تحتاج rate limit/audit؟

## Skill 07 — File Import Safety

- MIME + signature validation.
- size/page/row limits.
- private quarantine storage.
- async parsing.
- no macros/scripts.
- protect from zip bombs/path traversal.
- prompt-injection-resistant AI extraction.
- import remains Draft until review.

## Skill 08 — SOLID & Clean Code

- SRP: controller لا يحسب mastery.
- OCP: provider جديد لا يغير كل call sites.
- LSP: adapters تحترم contract.
- ISP: interfaces صغيرة.
- DIP: domain يعتمد على ports.

استخدم DRY عندما يكون التكرار مفاهيميًا حقيقيًا، لا تنشئ abstractions لمجرد تقليل أسطر.

## Skill 09 — Testing

اختبر:
- happy path.
- authorization denial.
- invalid input.
- duplicate submission.
- concurrency.
- archived content.
- stale version.
- payment replay.
- mastery edge cases.
- partial import failures.

## Skill 10 — Observability

كل flow حرج يحمل correlation IDs ومعلومات كافية للتتبع بدون secrets.

## Skill 11 — Performance

- measure before optimize.
- detect N+1.
- paginate.
- index based on queries.
- batch imports.
- queue heavy parsing/AI.
- لا cache mastery بشكل يسبب stale decisions.

## Skill 12 — AI Integration

LLM مناسب لـexplanations/hints/classification/drafting/extraction suggestions.
غير مناسب للauthorization/billing/mastery/final publish authority.

## Skill 13 — Code Review

رتب الأولوية:
1. Correctness
2. Security
3. Data Integrity
4. Domain Compliance
5. Tests
6. Maintainability
7. Performance
8. Style

## Skill 14 — Documentation

إذا تغير:
- Business rule → PRD/Domain.
- Architecture → Architecture/ADR future.
- Schema → ERD.
- API → API Contracts/OpenAPI.
- Algorithm → Adaptive Engine.
