# QUP — Product Requirements Document v1.0

## 1. Product Summary

QUP منصة Web للتعلم التكيفي للتحضير لـ:
- القدرات
- التحصيلي
- STEP

القيمة الأساسية:

```text
تشخيص
→ Skill Profile
→ اكتشاف الفواقد
→ ترتيب الأولويات
→ تدريب تكيفي
→ تحديث المستوى بعد كل Evidence
→ إعادة قياس
→ إغلاق الفجوة
```

## 2. Product Principle

كل إجابة يقدمها الطالب يجب أن تضيف معلومة جديدة عن مستواه، وكل معلومة جديدة يجب أن تؤثر في القرار التعليمي التالي.

الـAI داخل QUP Engine/Service وليس User مستقل، ولا يجوز اختزال المنتج إلى ChatGPT داخل بنك أسئلة.

## 3. Personas

### Student
- إنشاء حساب/تسجيل دخول.
- اختيار Exam.
- Mini Diagnostic مجاني بعد التسجيل.
- شراء باقة مستقلة لكل Exam.
- إكمال Full Diagnostic دون خسارة Evidence السابق.
- اختبارات وتدريب تكيفي.
- Skill Profile ونقاط القوة والفواقد.
- إعادة القياس ومراجعة الأخطاء.

لا يستطيع تعديل النتائج أو mastery أو بنك الأسئلة.

### Content Manager
- إضافة/تعديل الأسئلة.
- metadata.
- imports.
- review/approval حسب permission.
- متابعة جودة المحتوى.

لا يدير افتراضيًا الأسعار/الدفع/صلاحيات الإدارة.

### Admin
- Users/RBAC.
- Exams/Taxonomy.
- Question Bank/Imports.
- Plans/Payments/Entitlements.
- Reports/Audit.
- AI settings.
- System settings.

## 4. Confirmed Decisions

- V1 يدعم القدرات + التحصيلي + STEP.
- كل اختبار له باقة مستقلة.
- الحساب إلزامي قبل الجزء المجاني.
- Web only في V1.
- العميل لديه بنك أسئلة.
- Admin/Content Manager يديرون المحتوى من المنصة.
- الاستيراد يدعم الصيغ الشائعة المنظمة والوثائق والصور عبر pipeline آمن.
- كل Exam له Skill Profile مستقل.

## 5. MVP Scope

### Included
- Auth/RBAC.
- Exam catalog.
- per-exam package/entitlement.
- Mini Diagnostic.
- Full Diagnostic.
- Taxonomy management.
- Question bank + versioning/review.
- Manual entry + bulk import.
- Assessment Engine.
- Attempt recording.
- Student Skill Profile.
- Gap detection/ranking.
- Adaptive Training V1.
- Reassessment.
- Student/Admin/Content Manager dashboards.
- payment abstraction.
- audit/observability.
- AI-assisted content/explanation تحت review rules.

### Out of Scope for MVP
- Native mobile apps.
- Microservices.
- Runtime AI-generated unreviewed questions.
- Social/community features.
- Complex gamification economy.
- Production BKT/IRT before calibration data.

## 6. Student Journey

```text
Register
→ Login
→ Select Exam
→ Mini Diagnostic
→ Preliminary Result
→ Purchase Exam Package
→ Continue Full Diagnostic
→ Skill Profile
→ Ranked Gaps
→ Adaptive Training
→ Reassessment
→ Mastered or Continue
→ Next Gap
→ Full Re-Diagnostic when eligible
```

## 7. Mini Diagnostic

Baseline recommendation:
- default 12 questions.
- configurable per exam/blueprint.
- representative coverage, not random first 12.

Before payment show:
- preliminary level.
- limited strengths.
- limited weaknesses.

Do not expose full skill map/remediation plan.

After purchase preserve attempts/evidence and continue.

## 8. Re-Diagnostic Defaults

Configurable baseline:
- 7-day cooldown.
- 30 new eligible training attempts minimum.

Not hard-coded.

## 9. Taxonomy

```text
Exam
└── Domain
    └── Skill
        └── SubSkill
```

Requirements:
- versioning.
- archive instead of destructive delete.
- weights/thresholds configurable.
- prerequisites.
- display order/status.

## 10. Question Requirements

Question is not text only. It needs:
- exam/taxonomy version.
- domain/skill/subskill mappings.
- primary/secondary attribution.
- difficulty.
- options.
- correct answer.
- explanation.
- source/provenance.
- lifecycle status.
- version.
- review history.

Published edits create new version.

## 11. Question Lifecycle

```text
DRAFT
→ UNDER_REVIEW
→ APPROVED
→ PUBLISHED
→ ARCHIVED
```

Imported/AI content does not skip review.

## 12. Assessment Types

Architecture supports:
- MINI_DIAGNOSTIC
- FULL_DIAGNOSTIC
- PRACTICE
- ADAPTIVE_TRAINING
- SKILL_REASSESSMENT
- FULL_REASSESSMENT
- MOCK_EXAM

## 13. Mastery State

Per measurable node store:
- mastery score.
- confidence score.
- evidence count.
- coverage.
- state.
- history/version.

States:
```text
UNASSESSED
UNCERTAIN
GAP
DEVELOPING
READY_FOR_REASSESSMENT
MASTERED
```

MASTERED requires successful reassessment.

## 14. Content Import

Initial families:
- XLSX/CSV/TSV/JSON
- DOCX/PDF/TXT
- PNG/JPG/JPEG/WebP

```text
Upload
→ Detect
→ Parse/Extract
→ Normalize
→ Validate
→ Duplicate Detection
→ Draft/Staging
→ Human Review
→ Publish
```

Unsupported files fail clearly and safely.

## 15. Functional Requirements

### Auth
- register/login/logout.
- backend RBAC.
- revocable sessions.
- modern password hashing.

### Content
- manual question creation.
- question versions.
- multi-skill mappings.
- import preview/report.
- no silent publish of invalid items.
- provenance stored.

### Assessment
- server-side grading.
- idempotent submission.
- resume session.
- historical exact question version.

### Mastery
- deterministic updates.
- confidence separate.
- immutable events.
- algorithm/config version persisted.
- low evidence cannot cause false mastery.

### Adaptive
- select target gap/node.
- difficulty/coverage/novelty aware selection.
- repeated failures may lower difficulty or target prerequisite.
- decision auditable.
- LLM not source of mastery.

### Billing
- separate plan per Exam.
- successful verified payment grants entitlement idempotently.
- payment provider behind adapter.
- webhook replay safe.

## 16. NFRs

Security:
- no answer leakage.
- backend authorization.
- secure sessions.
- rate limits.
- safe uploads.
- auditability.

Reliability:
- transactional integrity.
- idempotency.
- retries with bounds.
- backups/restore plan.

Performance:
- pagination.
- no N+1.
- async heavy parsing/AI.
- core answer path independent of slow LLM.

Maintainability:
- strict TypeScript.
- modular boundaries.
- migrations.
- OpenAPI.
- automated tests.

Accessibility:
- RTL-first.
- keyboard/semantic UI.
- sufficient contrast.
- responsive web.

## 17. Metrics to Instrument

- diagnostic start/completion.
- preview→purchase conversion.
- assessment abandonment.
- gap closure.
- questions-to-mastery.
- reassessment pass/fail.
- skill improvement.
- question exposure/difficulty.
- import failure.
- AI latency/cost/failure.
- payment success/failure.

Targets الرقمية تحتاج قرار Product Owner.
