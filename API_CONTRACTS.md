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

- `register`: `{ email?, phone?, password, displayName? }` — at least one of email/phone;
  phone in E.164 (`+9665XXXXXXXX`). Unknown fields are rejected. `201` + session cookie.
- `login`: `{ identifier, password }` — identifier is the email or the phone. `200` + session cookie.
  Unknown account and wrong password both return `401 INVALID_CREDENTIALS`.
- `logout`: `204`, clears the cookie. `sessions/revoke`: signs out every *other* session, `204`.
- `me`: `{ user, roles, permissions }`.
- No OTP/verification (OPEN_QUESTIONS.md #6).

Errors: `VALIDATION_FAILED` (400, with `details: [{ path, message }]`), `INVALID_CREDENTIALS` (401),
`UNAUTHENTICATED` (401), `ACCOUNT_DISABLED` (403), `FORBIDDEN` (403), `IDENTIFIER_TAKEN` (409),
`RATE_LIMITED` (429).

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
GET   /admin/exams
POST  /admin/exams
PATCH /admin/exams/:id
GET   /admin/exams/:id/taxonomy-versions
POST  /admin/exams/:id/taxonomy-versions
POST  /admin/taxonomy-versions/:id/publish
```

Implemented (permission `taxonomy.manage`, currently ADMIN only — OPEN_QUESTIONS.md #16a):
- Exams start `DRAFT` and are invisible to students; `GET /exams/:id` returns 404 for a non-active exam.
- Exam status is forward-only: `DRAFT → ACTIVE → ARCHIVED` (`DRAFT → ARCHIVED` too). `code` and
  `slug` are not editable. Activation requires a published taxonomy (`EXAM_HAS_NO_PUBLISHED_TAXONOMY`).
- Publishing requires at least one active domain, each with at least one active skill
  (`TAXONOMY_INCOMPLETE`); it archives the exam's previously published version and is audited.
- `GET /admin/exams/:id/taxonomy-versions` lists the exam's versions in every status, newest first:
  `{ items: TaxonomyVersion[] }`. Unknown exam: `404 EXAM_NOT_FOUND`. Not paginated — an exam has a
  handful of versions over its life.

## Taxonomy

```text
GET  /admin/taxonomy-versions/:id/tree
POST /admin/domains
POST /admin/skills
POST /admin/subskills
PATCH /admin/domains/:id
PATCH /admin/skills/:id
PATCH /admin/subskills/:id
POST /admin/skills/:id/prerequisites
DELETE /admin/skills/:id/prerequisites/:prerequisiteSkillId
POST /admin/nodes/:type/:id/archive
```

Implemented:
- All structural changes require a `DRAFT` version; otherwise `422 TAXONOMY_VERSION_NOT_DRAFT`
  (OPEN_QUESTIONS.md #16b). The database enforces the same rule (migration `0005`).
- Weights: `(0, 99.9999]`, 4 decimals. Mastery threshold: `(0, 1]`, 3 decimals; `null` clears it.
  Values with more precision are rejected (`VALIDATION_FAILED`), never rounded.
- Prerequisites: `204`; re-adding updates the importance weight. A cycle or self-reference returns
  `422 PREREQUISITE_CYCLE`; a skill from another version, `422 PREREQUISITE_OUTSIDE_VERSION`.
  Removing one is `204` and idempotent (removing an absent link is also `204`); unknown skill
  `404 TAXONOMY_NODE_NOT_FOUND`. Links in a DRAFT have never been used by an assessment, so nothing
  historical is lost.
- Codes are unique per parent (`409 TAXONOMY_CODE_TAKEN`). `:type` is `domain | skill | subskill`.
- Edits (`PATCH`, `204`): domains take `name`, `description`, `weight`, `displayOrder`; skills add
  `masteryThreshold`, `priorityWeight`, `minCoverage`; subskills take the domain fields plus
  `masteryThreshold`. `code` is never editable — questions and imports refer to it. At least one
  field; unknown node `404 TAXONOMY_NODE_NOT_FOUND`.

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

Implemented, with two additions to the outline above:
```text
GET  /admin/question-versions/:id     one version: options, answer key, mappings, reviews
PUT  /admin/question-versions/:id     replace the whole content of a DRAFT
```
- Permissions (OPEN_QUESTIONS.md #14): `questions.create` reads, authors, submits;
  `questions.review` approves or sends back; `questions.publish` publishes and archives (ADMIN only).
- Lifecycle `DRAFT → UNDER_REVIEW → APPROVED → PUBLISHED → ARCHIVED`; a review with
  `REJECTED` or `CHANGES_REQUESTED` (notes required) returns the version to `DRAFT`. Content is
  editable **only in DRAFT** (OPEN_QUESTIONS.md #16c) — enforced in the database too (`0007`).
- Content is structured blocks (`{ blocks: [{ type: "text" | "math", … }] }`), never HTML.
- V1 types: `SINGLE_CHOICE`, `MULTIPLE_CHOICE`, `TRUE_FALSE`. Submitting and publishing require a
  valid answer key and exactly one PRIMARY mapping (`422 QUESTION_CONTENT_INVALID` with `details`).
  Mapping weights default to PRIMARY 1.00 / SECONDARY 0.35 (DOMAIN_MODEL.md §6).
- Each `QUESTION_CONTENT_INVALID` detail is `{ path, message, rule }`; `message` is for developers,
  `rule` is a stable code for clients to translate: `OPTION_COUNT`, `CORRECT_ANSWER_COUNT`,
  `PRIMARY_MAPPING_COUNT`, `DUPLICATE_OPTION_KEY`, `DUPLICATE_MAPPING`, `MAPPING_OUTSIDE_VERSION`,
  `TAXONOMY_VERSION_MISSING`, `DATABASE_RULE` (a database check fired as the backstop).
- Publishing needs a published taxonomy (`TAXONOMY_NOT_PUBLISHED`) and archives the question's
  previous live version. One version in progress per question (`409 QUESTION_VERSION_IN_PROGRESS`).
- `GET /admin/questions?status=&taxonomyVersionId=&limit=&offset=` lists each question once, by its
  newest version: `{ items, page: { limit, offset, total } }`, `limit` ≤ 100.
  Each item's `latestVersion.stemPreview` is one line of plain text: text blocks joined by a space,
  math as `[…]`, cut to 140 characters with `…`.
- Publish and archive are audited. Admin responses include the answer key; students will only
  ever receive `StudentQuestionView` (no answer key, explanation, difficulty or mappings).

### Question authoring context

```text
GET /admin/question-authoring/taxonomies
GET /admin/question-authoring/taxonomy-versions/:id/outline
```

Permission `questions.create`: authors choose a taxonomy and map skills without
`taxonomy.manage` (admins only, OPEN_QUESTIONS.md #16a). Read-only, through the catalog's contract.
- `taxonomies` → `{ items: [{ exam: { id, code, nameAr, status }, versions: [{ id, versionCode,
  status }] }] }`: exams that are not ARCHIVED, by code; their versions that are not ARCHIVED,
  newest first.
- `outline` → `{ version: { id, examId, versionCode, status }, domains: [{ id, code, name, skills:
  [{ id, code, name, subskills: [{ id, code, name }] }] }] }`: ACTIVE nodes only, in display
  order. Unknown version: `404 TAXONOMY_VERSION_NOT_FOUND`.

## Skill profile

```text
GET /exams/:examId/skill-profile
```

The signed-in student's own profile (no route takes a student id). Exam not active:
`404 EXAM_NOT_AVAILABLE`; no access to the exam: `403 SKILL_PROFILE_REQUIRES_ACCESS` (PRD §7: the
full skill map is paid).
- `domains[].skills[]`: `{ id, name, state, mastery, coverage, evidenceCount, gapSeverity,
  subskills[] }` for every active skill of the published taxonomy, in display order. `mastery` is
  `null` until the node has evidence — the prior is never shown as a level.
- A skill with subskills is computed from them (ADAPTIVE_ENGINE.md §14; confidence, coverage and
  state per OPEN_QUESTIONS.md #12c).
- `gaps`: skills that are gaps (§15: measured, confident enough, below their threshold, not
  mastered), largest `severity = (threshold − mastery) / threshold` first.
- `summary`: `{ skills, assessed, gaps, readyForReassessment, mastered }`.

## Blueprints

Diagnostic blueprints (B2): how many questions a mini or full diagnostic asks, and how they are
weighted across domains. Permission `blueprints.manage`, ADMIN only (migration 0012).

```text
GET   /admin/exams/:examId/blueprints     { items: BlueprintSummary[] } every status, newest first
POST  /admin/exams/:examId/blueprints     { type, code, name, questionCount } → 201 Blueprint (DRAFT)
GET   /admin/blueprints/:id               Blueprint
PATCH /admin/blueprints/:id               { name?, questionCount?, domainWeights?: [{ domainId, weight | null }] }
POST  /admin/blueprints/:id/activate      DRAFT → ACTIVE, audited
POST  /admin/blueprints/:id/archive       DRAFT | ACTIVE → ARCHIVED, audited
```

```json
{
  "id": "…", "examId": "…", "type": "FULL_DIAGNOSTIC", "code": "FULL-2026", "name": "التشخيص الكامل",
  "questionCount": 40, "status": "DRAFT", "createdAt": "…", "updatedAt": "…",
  "taxonomyVersion": { "id": "…", "versionCode": "2026.1", "status": "PUBLISHED" },
  "domains": [{ "id": "…", "name": "لفظي", "taxonomyWeight": 1, "weight": null }]
}
```

- `type`: `MINI_DIAGNOSTIC | FULL_DIAGNOSTIC`. `questionCount`: 1–200, the whole diagnosis (questions
  the student already answered count towards it). `BlueprintSummary` has `taxonomyVersionId`
  instead of `taxonomyVersion` and no `domains`.
- A new blueprint is pinned to the exam's published taxonomy version
  (`422 EXAM_HAS_NO_PUBLISHED_TAXONOMY`; unknown exam `404 EXAM_NOT_FOUND`); `code` is unique per exam
  (`409 BLUEPRINT_CODE_TAKEN`).
- `weight: null` uses the taxonomy's domain weight; `0` leaves the domain out. A domain outside the
  pinned version is `422 BLUEPRINT_DOMAIN_UNKNOWN`; weights that leave no domain are
  `422 BLUEPRINT_WEIGHTS_EMPTY`.
- Only a DRAFT changes (`409 BLUEPRINT_NOT_EDITABLE`): sessions record the blueprint they were planned
  from. Activation archives the exam's previous ACTIVE blueprint of the same type in the same
  transaction (at most one ACTIVE per exam and type, enforced by an index); a draft whose version is
  no longer the published one is `409 BLUEPRINT_TAXONOMY_NOT_PUBLISHED`. Activating an active or
  archiving an archived blueprint returns it unchanged.

## Settings

```text
GET /admin/settings
GET /admin/settings/:key/versions
PUT /admin/settings/:key
```

Permission `settings.manage` (ADMIN only, migration 0011). Typed, versioned settings stored in
`system_settings`: a save adds the next version, nothing is overwritten, and version 0 is the code
default.
- Items are `{ key, description, valueType, version, value, updatedAt, updatedBy }`; `versions` is
  newest first and ends with version 0 (`updatedAt: null`).
- `PUT` takes `{ expectedVersion, value }`. A stale `expectedVersion` is
  `409 SETTING_VERSION_CONFLICT`; a value breaking the key's rules is `422 SETTING_VALUE_INVALID`
  with `details`; an unknown key is `404 SETTING_NOT_FOUND`. Each save is audited
  (`settings.update`).
- V1 key `assessment.preliminaryResult.levels`: the five levels `NEEDS_FOUNDATION`, `BEGINNER`,
  `INTERMEDIATE`, `GOOD`, `ADVANCED` in that order, each `{ level, fromPercentage }` with an integer
  0–100, the first 0, strictly increasing (OPEN_QUESTIONS.md #10b/#10c).

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

Implemented (mini diagnostic — the first vertical slice):
```text
GET  /assessments?examId=&status=&limit=20&offset=0 caller-owned history, newest first
POST /exams/:examId/assessments/mini-diagnostic   201 new · 200 resumed (open session returned)
GET  /assessments/:sessionId                      status + progress
POST /assessments/:sessionId/start                CREATED → IN_PROGRESS
GET  /assessments/:sessionId/current-item         next unanswered item, redacted; item null when done
POST /assessments/:sessionId/items/:itemId/answer { answer: { optionKey } | { optionKeys: [] } }
POST /assessments/:sessionId/items/:itemId/skip   recorded, no mastery evidence
POST /assessments/:sessionId/complete
GET  /assessments/:sessionId/result               preliminary result (below)
```
- 12 questions by default (OPEN_QUESTIONS.md #10), spread over domains by weight, then skills, nearest
  difficulty 0.5, never a question the student has seen. One mini diagnostic per exam (#10a):
  asking again after completing it is `409 MINI_DIAGNOSTIC_ALREADY_COMPLETED` with
  `details: { sessionId }` — the caller's own finished session, so a client can show its result.
- Another student's session is reported as `404 ASSESSMENT_NOT_FOUND` (no IDOR).
- Answer and skip require `Idempotency-Key` (UUID). A retry with the same key returns the original
  result and records nothing new; the same key for another item is `IDEMPOTENCY_KEY_REUSED`; a
  second answer to a finalized item is `409 ASSESSMENT_ITEM_ALREADY_ANSWERED`.
- Graded on the server from the stored key; unknown fields (e.g. a forged `isCorrect`) are rejected.
  An option that does not exist is `400 INVALID_ANSWER`.
- The attempt, its mastery evidence (every mapped node) and auto-completion commit in one
  transaction; submissions within a session are serialized by a row lock.

### Full diagnostic

```text
POST /exams/:examId/assessments/full-diagnostic   201 new · 200 resumed (open session returned)
```

The paid diagnosis that continues the mini one (PRD §6–§7, OPEN_QUESTIONS.md #9a). Same session
view and the same session endpoints as the mini diagnostic.

- Requires active access to the exam: `403 FULL_DIAGNOSTIC_REQUIRES_ACCESS`. A session already
  started can be finished. Inactive exam: `404 EXAM_NOT_AVAILABLE`.
- Size: the exam's active `FULL_DIAGNOSTIC` blueprint (see Blueprints), else 40. The size is the
  whole diagnosis: distinct questions the student already **answered** in this exam (skips do
  not count) count towards their primary skill's share, so after a 12-question mini diagnostic
  the session holds 28 more. Shares follow domain weights (blueprint override, else taxonomy),
  then skill weights; within a skill the questions nearest difficulty 0.5 win; a question already
  given in any session is never repeated. Nothing left to ask: `422 NO_QUESTIONS_AVAILABLE`.
- One per exam for now: after completing it, `409 FULL_DIAGNOSTIC_ALREADY_COMPLETED` with
  `details: { sessionId }`. Re-diagnostic (PRD §8) comes later.
- A blueprint pinned to a taxonomy version that is no longer published is ignored (defaults apply).
  Both diagnostics record the blueprint they were planned from.

### Session history

`GET /assessments` requires a signed-in account. Optional `examId` (UUID) and `status`
(`CREATED | IN_PROGRESS | COMPLETED | ABANDONED | EXPIRED`) filter before pagination.
`limit` defaults to 20, is bounded to 1–100; `offset` defaults to 0 and is bounded to
0–1,000,000. Unknown query fields, including `studentId`, are rejected.

```json
{
  "items": [{
    "id": "session-uuid", "examId": "exam-uuid", "type": "MINI_DIAGNOSTIC",
    "status": "IN_PROGRESS", "exam": { "id": "exam-uuid", "nameAr": "اسم الاختبار" },
    "createdAt": "2026-10-17T10:00:00.000Z",
    "startedAt": "2026-10-17T10:01:00.000Z", "completedAt": null,
    "progress": { "answered": 3, "total": 12 }
  }],
  "page": { "limit": 20, "offset": 0, "hasMore": false }
}
```

- Identity comes only from the session cookie. The result contains no other students' sessions,
  question content/keys, attempt answers, skill map or mastery estimates.
- `answered` counts finalized items, including skips, consistently with the session endpoint.
- Ordered by `createdAt DESC, id DESC`; progress and sessions use one consistent read snapshot.
  Offset pagination reflects the current history on each request: a newly created session may
  shift later pages, so this is a browsing view rather than a fixed export.
- Exam names remain available after an exam is archived. Existing session ownership and result
  checks still apply when opening a history entry.
- The web route `/dashboard` displays this history; `/assessments/:sessionId` starts or resumes
  the exact mini diagnostic without selecting a new set of questions.

### Preliminary Result

What a student sees before paying (OPEN_QUESTIONS.md #10b). `422 ASSESSMENT_NOT_COMPLETED` until the
session is completed.

```json
{
  "kind": "PRELIMINARY",
  "score": { "correct": 15, "total": 20, "percentage": 75 },
  "level": { "code": "GOOD", "label": "جيد" },
  "strengths": [
    { "skill": "الاستيعاب القرائي", "rating": { "code": "VERY_GOOD", "label": "جيد جدًا" } }
  ],
  "weaknesses": [
    { "skill": "النسب والتناسب", "rating": { "code": "NEEDS_TRAINING", "label": "يحتاج تدريب" } }
  ],
  "nextStep": { "type": "SUBSCRIBE", "message": "هذه قراءة أولية لمستواك. …" }
}
```

- `nextStep` is `null` once the student has access to the exam (see Billing): nothing left to sell.

- `level.code`: `NEEDS_FOUNDATION | BEGINNER | INTERMEDIATE | GOOD | ADVANCED` — a *diagnostic level*
  derived from `score.percentage`, never a predicted exam score. Band limits are configuration
  (defaults in OPEN_QUESTIONS.md #10c).
- `percentage` = correct ÷ all questions of the diagnostic, rounded; a skipped question is not correct.
- At most **2** strengths (best first) and **3** weaknesses (most in need of training first), taken
  only from skills the student actually answered a question on. Fewer when fewer were measured;
  never padded. A question on a subskill counts for its parent skill.
- Nothing else is returned: no skill ids, no per-skill numbers, no other skills, no training plan,
  no question content. The full analysis is entitlement-protected (PRD §7).

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

Implemented (provider: Stream — OPEN_QUESTIONS.md #2, #5a):
```text
GET   /exams/:examId/plans              plans on sale (none unless the exam is ACTIVE)
GET   /exams/:examId/my-access          { examId, hasAccess, activeUntil }  (activeUntil null = no end)
GET   /me/entitlements                  the caller's entitlements, newest first
POST  /payments                         { planId } + Idempotency-Key → 201 new · 200 existing checkout
GET   /payments/:id                     the caller's payment; poll this after returning from checkout
POST  /payments/webhooks/stream         provider only; authenticated by signature, not by session

GET   /admin/plans?examId=              permission billing.manage
POST  /admin/plans                      { examId, code, name, priceMinor, currency, durationDays|null } → DRAFT
PATCH /admin/plans/:id                  DRAFT only (422 PLAN_NOT_DRAFT otherwise)
POST  /admin/plans/:id/activate         DRAFT → ACTIVE, audited
POST  /admin/plans/:id/retire           → RETIRED, audited; existing entitlements are kept
POST  /admin/entitlements               { studentId, examId, durationDays|null } manual grant, audited
POST  /admin/entitlements/:id/revoke    idempotent, audited
```
- Money is `{ amountMinor, currency }`: an integer count of minor units (halalas), never a float.
  SAR only; an offered plan costs at least 100 (1.00 SAR). Price and duration are frozen once ACTIVE.
- Payment view: `{ id, planId, status, amount, checkoutUrl, checkoutExpiresAt, paidAt, createdAt }`.
  `status`: `PENDING | SUCCEEDED | FAILED | REFUNDED | CANCELLED`. `checkoutUrl` is the provider's
  hosted page, present only while PENDING. The client sends the plan and nothing else: the price is
  the plan's, the student is the session's.
- One open checkout per student and plan: asking again returns the same one (200) until it expires
  (`CHECKOUT_TTL_MINUTES`, default 60), then a fresh one replaces it.
- **Returning from the checkout page proves nothing.** A payment becomes SUCCEEDED only after a
  signed webhook *and* Stream's own API confirming status, amount and currency. Payment and
  entitlement then commit in one transaction; a replayed or duplicated event grants nothing more.
- Full refund at Stream ⇒ payment REFUNDED, entitlement REVOKED. Partial refund ⇒ logged, access kept.
- Errors: `PLAN_NOT_AVAILABLE` (404), `ALREADY_ENTITLED` (409), `CHECKOUT_SUPERSEDED` (409),
  `IDEMPOTENCY_KEY_REUSED` (422), `PLAN_NOT_SELLABLE` (422), `INVALID_PLAN_TRANSITION` (422),
  `PLAN_CODE_TAKEN` (409), `PAYMENT_NOT_FOUND` (404, also for another student's payment),
  `PAYMENTS_NOT_CONFIGURED` (503), `PAYMENT_PROVIDER_UNAVAILABLE` (503, nothing was charged),
  `WEBHOOK_SIGNATURE_INVALID` (401).
- Webhook responses: 200 acknowledges (including events that are not ours); 503 asks Stream to retry.

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
