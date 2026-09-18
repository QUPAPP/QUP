# QUP Project Blueprint

هذه الحزمة هي مرجع المنتج والهندسة والتنفيذ لمنصة QUP للتعلم التكيفي. الهدف أن يستطيع أي مهندس أو Coding Agent فهم المشروع قبل كتابة الكود، وأن يبقى التنفيذ منظمًا وقابلًا للتوسع والاختبار.

> القاعدة الأساسية: لا تبدأ بتنفيذ Feature قبل قراءة `AGENTS.md` ثم `PRD.md` ثم الوثيقة المتخصصة المرتبطة بالمهمة.

## ترتيب القراءة

1. `AGENTS.md`
2. `PRD.md`
3. `DOMAIN_MODEL.md`
4. `ARCHITECTURE.md`
5. `ERD.md`
6. `WORKFLOWS.md`
7. `ADAPTIVE_ENGINE.md`
8. `API_CONTRACTS.md`
9. `SECURITY.md`
10. `CODING_STANDARDS.md`
11. `TESTING.md`
12. `UI_BRAND.md`
13. `IMPLEMENTATION_PLAN.md`
14. `OPEN_QUESTIONS.md`

## Source of Truth

عند التعارض استخدم الأولوية التالية:

1. قرار صريح جديد من Product Owner / العميل.
2. `PRD.md` لسلوك المنتج.
3. `DOMAIN_MODEL.md` لقواعد الدومين.
4. `ARCHITECTURE.md` للقرارات التقنية.
5. بقية الوثائق.
6. الكود الحالي ليس مصدر حقيقة إذا خالف الوثائق المعتمدة.

## Product Principle

QUP ليس بنك أسئلة مزودًا بـChatbot. QUP هو **Adaptive Learning System** يبني Skill Profile للطالب، يكتشف الفواقد التعليمية، يختار التدريب المناسب، يحدث مستوى الإتقان مع كل Evidence، ثم يعيد القياس حتى إغلاق الفجوة.

## Baseline Stack

- TypeScript end-to-end
- pnpm Workspaces + Turborepo
- Next.js + React
- NestJS + Fastify
- PostgreSQL + Drizzle ORM
- Redis + BullMQ
- pgvector
- S3-compatible storage
- Zod + OpenAPI
- Pino + Sentry + OpenTelemetry
- Vitest + Playwright
- Docker + GitHub Actions
