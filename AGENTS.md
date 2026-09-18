# AGENTS.md — QUP Engineering Agent Contract

هذه الوثيقة ملزمة لأي Coding Agent أو مهندس يعمل على QUP.

## 1. دورك

تصرف كـ **Senior Software Engineer + Software Architect**. لا تنفذ طلبًا حرفيًا إذا كان يكسر Domain Rule أو Security أو Data Integrity. وضّح المشكلة، اقترح الحل الصحيح، ثم نفّذ وفق الوثائق المعتمدة.

مهمتك ليست زيادة عدد الملفات أو الأسطر؛ مهمتك بناء منتج صحيح، آمن، قابل للاختبار، قابل للصيانة والتوسع.

## 2. قبل كتابة أي كود

يجب أن:

1. تقرأ `PRD.md`.
2. تقرأ `DOMAIN_MODEL.md`.
3. تقرأ `ARCHITECTURE.md`.
4. تقرأ `ERD.md` إذا كانت المهمة تلمس البيانات.
5. تحدد Acceptance Criteria.
6. تحدد التأثير على DB/API/Security/Tests.
7. تكتب خطة قصيرة قبل المهام غير البسيطة.

لا تخترع Business Rule غير موجود. إذا القرار غير محسوم راجع `OPEN_QUESTIONS.md` ولا تدفن افتراضًا داخل الكود.

## 3. مبادئ إلزامية

طبّق:

- SOLID
- Separation of Concerns
- Dependency Inversion
- DRY بدون Over-abstraction
- KISS
- YAGNI
- Composition over inheritance
- Explicit over implicit
- Secure by default
- Fail fast at boundaries
- Test behavior, not implementation details

### ممنوع

- Business logic داخل Controllers.
- Business logic داخل React components.
- استدعاء DB مباشرة من UI.
- Hard-coded exam names أو skill IDs أو mastery thresholds.
- استخدام LLM لاتخاذ قرار Mastery.
- تعديل Question Version منشورة بطريقة تمحو التاريخ.
- حذف Skill/Question مستخدمة تاريخيًا.
- إرسال `correctAnswer` للعميل قبل إجابة الطالب.
- الاعتماد على إخفاء زر في UI بدل authorization backend.
- Catch فارغ.
- Magic numbers.
- `any` بدون سبب موثق.
- Cyclic module dependencies.
- Deploy أو production migration بدون طلب صريح.

## 4. Dependency Direction

```text
UI / HTTP / CLI
      ↓
Application Layer
      ↓
Domain
      ↑
Infrastructure Adapters
```

الـDomain لا يعتمد على NestJS أو Next.js أو Drizzle أو Redis أو أي AI SDK.

## 5. Modules

```text
auth
users
rbac
exams
taxonomy
questions
content-import
assessments
mastery
adaptive
subscriptions
payments
admin
analytics
ai
audit
settings
notifications
```

لا يتجاوز Module حدود Module آخر عبر جلب Repository داخلي بلا Contract.

## 6. Mastery Rules

- الـLLM لا يرفع أو يخفض Mastery.
- كل Answer صالح يولد Learning Evidence.
- Mastery وConfidence منفصلان.
- الوصول للthreshold لا يعني MASTERED تلقائيًا.
- MASTERED يحتاج Reassessment ناجح.
- Response time يسجل ولا يؤثر في V1.
- Skip لا يضيف Evidence في V1.
- Answer Reveal لا يعطي Positive Evidence.
- نفس Attempt لا يطبق Evidence مرتين.
- كل تحديث يحمل `algorithm_version` و`config_version`.
- كل Adaptive Decision قابل للتفسير والتدقيق.

## 7. Data Rules

- كل schema change عبر migration.
- لا destructive migration بدون backfill/rollback أو forward-fix plan.
- Foreign keys/unique constraints حيثما يلزم.
- UTC timestamps.
- transaction للعمليات الذرية.
- submit-answer idempotent.
- concurrency protection عند تحديث mastery.
- Outbox للأحداث غير المتزامنة الحرجة.

## 8. API Rules

- REST + OpenAPI في V1.
- Zod validation على الحدود.
- Authorization في backend دائمًا.
- pagination لأي collection تكبر.
- stable error codes.
- no stack traces.
- idempotency للمدفوعات وanswer submission.

## 9. Frontend Rules

- RTL-first.
- Accessible semantics.
- TanStack Query للسيرفر state.
- React Hook Form + Zod للنماذج.
- لا تكرر business rules في الواجهة.
- لا تحمل answer keys أو secrets في client bundle.
- استخدم design tokens.

## 10. Clean Code

- الوظيفة تفعل شيئًا واحدًا على مستوى abstraction واحد.
- الاسم يشرح النية.
- comments تشرح لماذا، لا ما يفعله السطر حرفيًا.
- تجنب boolean parameters الغامضة.
- استخدم enums/value objects للحالات المهمة.
- guard clauses أفضل من nesting العميق.
- errors typed/domain-specific.
- الحسابات pure قدر الإمكان.

## 11. Testing

كل Feature جديد يحتاج حسب طبيعته:
- Unit tests للـdomain logic.
- Integration tests للـDB/queues/adapters.
- API tests للauthorization/validation/idempotency.
- E2E للمسارات الحرجة.
- كل bug fix له regression test.

Mastery Engine يجب أن يكون deterministic وقابل لاختبارات table-driven/property-based.

## 12. Security Review

تحقق من:
- AuthN/AuthZ
- IDOR
- Mass assignment
- Injection/XSS/CSRF
- Rate limiting
- Sensitive data exposure
- Correct-answer leakage
- File upload safety
- SSRF
- Prompt injection
- Payment replay
- Auditability

## 13. تنفيذ المهمة

```text
Understand
→ Plan
→ Implement smallest coherent slice
→ Unit tests
→ Integration/API tests
→ Typecheck
→ Lint
→ Security review
→ Docs update
→ Report changed files + risks
```

لا تغير Architecture بصمت.

## 14. متى تقول "تم"

فقط بعد استيفاء Definition of Done في `IMPLEMENTATION_PLAN.md`/قسم DoD.
