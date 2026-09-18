# QUP API Contracts — V1 Outline

Base: `/api/v1`

هذا Boundary Specification وليس OpenAPI النهائي؛ يجب توليد/صيانة OpenAPI من التنفيذ.

## Conventions

- JSON.
- UTC ISO timestamps.
- stable error codes.
- pagination.
- request IDs.
- backend authorization.
- idempotency على critical writes.
- no answer leakage.

Error shape:
```json
{
  "error": {
    "code": "ASSESSMENT_ITEM_ALREADY_ANSWERED",
    "message": "This item has already been finalized.",
    "requestId": "..."
  }
}
```

## Auth

```text
POST /auth/register
POST /auth/login
POST /auth/logout
GET  /auth/me
POST /auth/sessions/revoke
```

Exact email/phone verification TBD.

## Exams

Student:
```text
GET /exams
GET /exams/:examId
GET /exams/:examId/my-access
GET /exams/:examId/my-progress
```

Admin:
```text
POST  /admin/exams
PATCH /admin/exams/:id
POST  /admin/exams/:id/taxonomy-versions
POST  /admin/taxonomy-versions/:id/publish
```

## Taxonomy

```text
GET  /admin/taxonomy-versions/:id/tree
POST /admin/domains
POST /admin/skills
POST /admin/subskills
PATCH /admin/skills/:id
POST /admin/skills/:id/prerequisites
POST /admin/nodes/:type/:id/archive
```

## Questions

```text
GET    /admin/questions
POST   /admin/questions
GET    /admin/questions/:id
POST   /admin/questions/:id/versions
POST   /admin/question-versions/:id/submit-review
POST   /admin/question-versions/:id/reviews
POST   /admin/question-versions/:id/publish
POST   /admin/questions/:id/archive
```

Serializer/redaction يعتمد على caller/use case.

## Imports

```text
POST /admin/imports/upload
GET  /admin/imports/:id
GET  /admin/imports/:id/items
POST /admin/imports/:id/column-mapping
POST /admin/imports/:id/process
POST /admin/import-items/:id/resolve
POST /admin/imports/:id/create-drafts
```

## Assessments

```text
POST /exams/:examId/assessments/mini-diagnostic
POST /exams/:examId/assessments/full-diagnostic
POST /exams/:examId/assessments/mock
GET  /assessments/:sessionId
POST /assessments/:sessionId/start
GET  /assessments/:sessionId/current-item
POST /assessments/:sessionId/items/:itemId/answer
POST /assessments/:sessionId/items/:itemId/skip
POST /assessments/:sessionId/complete
```

### Submit Answer

Header:
```text
Idempotency-Key: <uuid>
```

Request:
```json
{
  "answer": { "optionKey": "B" },
  "clientTiming": { "responseTimeMs": 18400 }
}
```

Safe response:
```json
{
  "attemptId": "...",
  "result": { "isCorrect": true },
  "progress": { "answered": 7 },
  "next": { "type": "QUESTION" }
}
```

Never include future answer keys.

## Adaptive

```text
POST /exams/:examId/adaptive-sessions
GET  /adaptive-sessions/:id
GET  /adaptive-sessions/:id/current-item
POST /adaptive-sessions/:id/items/:itemId/answer
POST /adaptive-sessions/:id/pause
POST /adaptive-sessions/:id/resume
```

يمكن داخليًا إعادة استخدام assessment primitives.

## Mastery/Dashboard

```text
GET /me/exams/:examId/skill-profile
GET /me/exams/:examId/gaps
GET /me/exams/:examId/progress-history
GET /me/exams/:examId/recommendation
```

لا تعرض alpha/beta للطالب.

## Reassessment

```text
GET  /me/exams/:examId/reassessment-eligibility
POST /me/skills/:skillId/reassessment
POST /me/exams/:examId/full-reassessment
```

Server determines eligibility.

## Billing

```text
GET  /exams/:examId/plans
POST /payments
GET  /payments/:id
POST /payments/webhooks/:provider
GET  /me/entitlements
```

Webhook:
- signature validation.
- replay protection.
- idempotent transitions.

## Admin Analytics/Audit

```text
GET /admin/analytics/content-quality
GET /admin/analytics/learning
GET /admin/analytics/imports
GET /admin/audit-logs
```

## Internal Application Services

داخل monolith لا تستخدم HTTP-to-self.

Examples:
- `MasteryService.applyAttemptEvidence`
- `AdaptiveService.selectNextQuestion`
- `EntitlementService.hasExamAccess`
- `QuestionPublicationService.publishVersion`
