# QUP Domain Model

## 1. Ubiquitous Language

### Exam
اختبار مستقل داخل المنتج مثل القدرات أو التحصيلي أو STEP.

### Taxonomy Version
نسخة محددة من الهيكل التعليمي الخاص بـExam.

### Domain
مجال رئيسي داخل Exam.

### Skill
مهارة قابلة للقياس.

### SubSkill
جزء أدق من Skill.

### Learning Node
اسم عام لـSkill أو SubSkill قابلة للقياس.

### Question
الهوية المنطقية للسؤال.

### Question Version
المحتوى الفعلي الذي شاهده الطالب في لحظة محددة.

### Assessment Blueprint
قواعد تكوين اختبار أو جلسة تقييم.

### Assessment Session
جلسة تشخيص/اختبار/تدريب لطالب.

### Assessment Item
Question Version تم اختيارها ووضعها داخل Session.

### Attempt
إجابة الطالب النهائية على Item.

### Evidence
الأثر التعليمي الناتج من Attempt المؤهل.

### Mastery Score
درجة 0..1 ناتجة عن Mastery Engine. ليست درجة اختبار رسمية.

### Confidence Score
مدى الثقة في Mastery Estimate بناء على حجم ونوع Evidence.

### Coverage
مدى تغطية أجزاء Skill المطلوبة.

### Learning Gap
Learning Node ذات confidence كافٍ وmastery أقل من threshold.

### Reassessment
تقييم قصير للتحقق من الإتقان قبل التحويل إلى MASTERED.

### Adaptive Decision
قرار النظام عن target node/question القادم مع سبب قابل للتدقيق.

### Entitlement
حق الطالب في الوصول إلى Exam/ميزات مدفوعة نتيجة شراء أو منح إداري.

## 2. Aggregate Boundaries

### Identity/RBAC
- User
- Role
- Permission
- Session

### Exam Catalog
- Exam
- TaxonomyVersion
- Domain
- Skill
- SubSkill
- Prerequisite

### Question Bank
- Question
- QuestionVersion
- QuestionOption
- QuestionMapping
- Review
- ImportBatch

### Assessment
- Blueprint
- Session
- AssessmentItem
- Attempt

### Mastery
- StudentMasteryState
- MasteryEvent
- LearningGap projection

### Adaptive
- AdaptiveSession
- AdaptiveDecision

### Billing
- Plan
- Payment
- Entitlement

## 3. Core Invariants

### Questions
- Published Question Version لا يتم تعديلها بما يمحو التاريخ.
- Attempt يشير إلى exact `question_version_id`.
- السؤال المنشور يجب أن يملك correct answer صالحًا.
- السؤال المنشور يجب أن يملك mapping تعليميًا صالحًا.
- provenance محفوظ.

### Assessment
- الطالب لا يجيب Item لا ينتمي إلى Session الخاصة به.
- Item finalized لا يعاد grading له.
- backend هو source of truth للتصحيح.
- session lifecycle enforceable.

### Mastery
- نفس Attempt/LearningNode لا يطبق Evidence مرتين.
- MasteryEvent immutable.
- algorithm/config version إلزامي.
- threshold وحده لا يساوي MASTERED.
- response time لا يؤثر في V1.
- skip لا يولد mastery evidence في V1.

### Billing
- نفس payment event لا يمنح entitlement مرتين.
- webhook replay لا يكرر grant.
- entitlement checked server-side.

## 4. State Machines

### Question Version
```text
DRAFT
→ UNDER_REVIEW
→ APPROVED
→ PUBLISHED
→ ARCHIVED
```

### Assessment Session
```text
CREATED
→ IN_PROGRESS
→ COMPLETED

CREATED/IN_PROGRESS
→ ABANDONED

IN_PROGRESS
→ EXPIRED
```

### Mastery
```text
UNASSESSED
→ UNCERTAIN
→ GAP
→ DEVELOPING
→ READY_FOR_REASSESSMENT
→ MASTERED
```

Reassessment failure:
```text
READY_FOR_REASSESSMENT
→ DEVELOPING
```

### Import Batch
```text
UPLOADED
→ QUEUED
→ PARSING
→ VALIDATING
→ READY_FOR_REVIEW
→ COMPLETED
```

Any processing state may end in `PARTIALLY_FAILED` or `FAILED`.

## 5. Taxonomy Rules

- Canonical hierarchy: Exam → Domain → Skill → SubSkill.
- SubSkill optional.
- القياس يكون على أصغر Learning Node مهيأة للقياس.
- parent mastery مشتقة وليست manually editable.
- prerequisites explicit وليست inferred من LLM runtime.
- taxonomy version محفوظة تاريخيًا.
- archived nodes تبقى قابلة للمرجعية.

## 6. Question Mapping

Question Version قد تقيس أكثر من Learning Node.

Each mapping:
- learning node.
- role: PRIMARY / SECONDARY.
- attribution weight.
- optional rationale.

Defaults:
- PRIMARY = 1.00
- SECONDARY = 0.35

## 7. Derived Data

لا تخزن derived values إلا إذا كانت هناك حاجة أداء/اتساق واضحة.

يمكن snapshot:
- parent mastery.
- exam progress.
- dashboard summaries.

لكن source projection يجب أن يكون معروفًا وقابلًا لإعادة البناء.
