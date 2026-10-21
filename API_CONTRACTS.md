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
  reassessment: { remainingAttempts } | null, subskills[] }` for every active skill of the published taxonomy, in display order. `mastery` is
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
- Key `assessment.fullReassessment.gate`: `{ cooldownDays, minTrainingAttempts }`, integers 0–365
  and 0–1000. Default `{ 7, 30 }` (PRD §8; the full re-diagnostic's gate, OPEN_QUESTIONS.md #12g).

## Imports

Structured import (A3, QUESTION_BANK_IMPORT.md). Permission `questions.create` — imports only ever
make DRAFT questions, which then go through review like any other.

```text
GET  /admin/imports?limit&offset                   batches, newest first
POST /admin/imports/upload                         { filename, contentBase64 } → 201 batch (UPLOADED)
GET  /admin/imports/:id                            batch + suggestedMapping
GET  /admin/imports/:id/items?status&limit&offset  rows in file order
POST /admin/imports/:id/process                    { taxonomyVersionId, mapping } → batch (READY_FOR_REVIEW)
POST /admin/import-items/:id/resolve               { action: "SKIP" | "INCLUDE" } → item
POST /admin/imports/:id/create-drafts              → batch (COMPLETED | PARTIALLY_FAILED)
```

- Files: `.csv`, `.tsv` (UTF-8, BOM allowed, RFC 4180 quoting), `.json` (array of flat objects), `.xlsx`
  (first sheet only; no other part is read). At most 2 MiB, 1000 rows, 50 columns, 5000 characters a
  cell; XLSX at most 200 entries and 20 MiB inflated. The upload route alone accepts a 3 MiB body.
  Errors: `422 IMPORT_FILE_TYPE_UNSUPPORTED`, `422 IMPORT_FILE_TOO_LARGE`, `422 IMPORT_FILE_INVALID`
  with `details.reason` (`NOT_UTF8 | BINARY_CONTENT | MALFORMED | EMPTY | TOO_MANY_ROWS |
  TOO_MANY_COLUMNS | CELL_TOO_LONG | ZIP_TOO_LARGE | NO_WORKSHEET`). The original is kept in private
  storage under a random key.
- Batch: `{ id, originalFilename, detectedType, status, headers, mapping, taxonomyVersionId, totals,
  createdAt, completedAt, suggestedMapping? }`; `totals: { detected, valid, invalid, duplicate,
  imported, skipped, errors: { CODE: rows } }`.
- `mapping`: `{ stem, options: [2–6 columns], correctAnswer, skill, subskill?, questionType?,
  explanation?, difficulty?, source? }` — column names of the file (`422 IMPORT_MAPPING_INVALID`,
  `details.fields`). The version must exist and not be archived (`404 TAXONOMY_VERSION_NOT_FOUND`).
- Row codes: `STEM_MISSING, OPTIONS_TOO_FEW, CORRECT_ANSWER_MISSING, CORRECT_ANSWER_UNKNOWN,
  QUESTION_TYPE_UNKNOWN, SKILL_UNKNOWN, SUBSKILL_UNKNOWN, DIFFICULTY_INVALID`, the question bank's
  content rules (`OPTION_COUNT, CORRECT_ANSWER_COUNT, …`), `DUPLICATE_IN_BANK` (with
  `duplicateOfQuestionId`), `DUPLICATE_IN_FILE`, and after creation `DRAFT_REJECTED`.
- Item: `{ id, sourceLocator ("row N"), status, errors, duplicateOfQuestionId, resultingQuestionVersionId,
  cells, question }`. Resolve: `SKIP` any row not imported; `INCLUDE` a duplicate (human
  confirmation) or undo a skip; anything else `409 IMPORT_ITEM_NOT_RESOLVABLE`.
- Processing again after drafts exist: `409 IMPORT_ALREADY_IMPORTED`; creating drafts before
  processing: `409 IMPORT_NOT_PROCESSED`. Drafts: `source_type "IMPORT"`, `source_reference` = the
  source column, else `"<file> · row N"`; created by the importer. Each row is claimed before its draft
  is written, so a double click imports it once.

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
- One per exam: after completing it, `409 FULL_DIAGNOSTIC_ALREADY_COMPLETED` with
  `details: { sessionId }`. Measuring again is the full re-diagnostic (below).
- A blueprint pinned to a taxonomy version that is no longer published is ignored (defaults apply).
  Both diagnostics record the blueprint they were planned from.

### Full re-diagnostic

```text
GET  /exams/:examId/full-reassessment                 status
POST /exams/:examId/assessments/full-reassessment     201 new · 200 resumed
GET  /assessments/:sessionId/full-reassessment-result
```

The whole exam measured again (PRD §6, §8; WORKFLOWS.md §6). Assumptions are in
OPEN_QUESTIONS.md #12g. The session is `type: "FULL_REASSESSMENT"`, and the usual session routes
run it (right/wrong only, no review).

**The gate** is the admin setting `assessment.fullReassessment.gate` (see Settings), default 7
days and 30 answers. Both must hold:

- the cooldown, counted from the completion of the latest full measurement (a full diagnostic or a
  re-diagnostic);
- answered training attempts recorded after that completion.

**Status:**

```json
{ "state": "WAITING", "openSessionId": null, "lastMeasuredAt": "…", "availableAt": "…",
  "trainingAttempts": { "done": 12, "required": 30 }, "cooldownDays": 7 }
```

`state`, first match:

1. `OPEN`: an unfinished re-diagnostic, always resumable.
2. `REQUIRES_ACCESS`.
3. `FULL_DIAGNOSTIC_REQUIRED`.
4. `WAITING`: the cooldown or the attempts are not met.
5. `ELIGIBLE`.

An inactive exam is `404 EXAM_NOT_AVAILABLE`.

**Start:**

- `403 FULL_REASSESSMENT_REQUIRES_ACCESS`.
- `409 FULL_REASSESSMENT_NOT_ELIGIBLE`, `details: { reason: "FULL_DIAGNOSTIC_REQUIRED" | "WAITING",
  availableAt, attemptsRemaining }`.
- `422 NO_QUESTIONS_AVAILABLE`.

The form uses the full diagnostic's recipe (its active blueprint, else 40 questions, difficulty
0.5). Earlier answers do not count toward the size. Unseen questions come first, and questions
seen before fill a skill's share only once its unseen ones run out. A question is never repeated
within the session.

**Result** (`404` for another type or another student; `422 ASSESSMENT_NOT_COMPLETED` before the
end): correct answers out of all items, compared with the previous full measurement.

```json
{ "score": { "correct": 31, "total": 40 },
  "previous": { "type": "FULL_DIAGNOSTIC", "completedAt": "…", "correct": 24, "total": 40 },
  "skills": [{ "skillId": "…", "name": "…", "correct": 8, "total": 10,
               "previousCorrect": 5, "previousTotal": 10 }] }
```

- Skills are listed in the taxonomy's order. A subskill's questions count toward its skill.
- When the previous measurement was the full diagnostic, its baseline includes the completed mini
  diagnostic, which it continued.
- Skips are not correct.
- A skill measured on one side only has 0/0 on the other.

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

Implemented as assessment sessions (the primitives are reused, as planned):

```text
POST /exams/:examId/assessments/training     201 new · 200 resumed (open session returned)
```

A training session is `type: "ADAPTIVE_TRAINING"` with 10 questions (OPEN_QUESTIONS.md #12d), chosen
one at a time; every other session route applies (`/assessments/:id`, `start`, `current-item`,
`answer`, `skip`, `complete`).

- Paid: `403 TRAINING_REQUIRES_ACCESS`. Nothing trainable with questions left: `422 NOTHING_TO_TRAIN`.
  Inactive exam: `404 EXAM_NOT_AVAILABLE`. One open training session per exam; any number over time.
- `current-item` returns the unanswered item, or chooses the next one (ADAPTIVE_ENGINE.md §15–§20:
  target skill by gap priority, difficulty near the student's mastery, best-scored unseen question,
  weighted pick among the top 3) and adds `item.target: { skillName }`. Each choice is stored as an
  `adaptive_decisions` row (target, mastery/confidence snapshot, target difficulty, scored
  candidates, reason codes, `engine_version` `adaptive-v1.0`, `config_version`
  `selection-config-v1.0`) in the same transaction as its item. Concurrent calls create one item.
  When nothing is left to train the session completes and `item` is `null`.
- `answer` / `skip` on a training item add, after the attempt is stored:
  `review: { correctOptionKeys: string[], explanation: RichContent | null }`. Diagnostics never do.
- `progress.total` is 10 from the start; the session completes on the 10th finalized item.
  `complete` ends it early: an unanswered item keeps no attempt and gives no evidence.
- Questions already given to the student in the exam are never chosen again.

## Mastery/Dashboard

```text
GET /me/dashboard                                   (implemented, B5)
```

The skill profile is `GET /exams/:examId/skill-profile` (above); gaps, recommendation and recent
progress are served together by the dashboard. لا تعرض alpha/beta للطالب.

`GET /me/dashboard` — one card per ACTIVE exam the student has a session in or access to, by code:

```json
{ "exams": [{
  "exam": { "id": "…", "nameAr": "القدرات العامة" },
  "hasAccess": true,
  "nextStep": { "type": "REASSESS", "skillId": "…", "skillName": "…" },
  "standing": {
    "summary": { "skills": 6, "assessed": 4, "gaps": 2, "readyForReassessment": 1, "mastered": 1 },
    "strengths": [{ "skillName": "…", "state": "MASTERED", "mastery": 0.91 }],
    "gaps": [{ "skillName": "…", "severity": 0.35 }],
    "improvements": [{ "nodeName": "…", "before": 0.42, "after": 0.58 }]
  }
}] }
```

- `nextStep.type`, first match (OPEN_QUESTIONS.md #12f): `RESUME_SESSION { sessionId, sessionType }`
  for any unfinished session → without access `START_MINI_DIAGNOSTIC` / `SUBSCRIBE` →
  `START_FULL_DIAGNOSTIC` → `REASSESS { skillId, skillName }` → `START_FULL_REASSESSMENT` (the
  re-diagnostic's status is `ELIGIBLE`) → `TRAIN { skillName | null }` → `ALL_MASTERED`.
- `standing` is `null` without access (PRD §7). Strengths: up to 2 measured non-gap skills, mastered
  first; gaps: up to 3 by severity; improvements: up to 3 nodes whose mastery rose most over the last
  7 days (first `before`, last `after` of their evidence).

## Reassessment

```text
POST /exams/:examId/skills/:skillId/reassessment     201 new · 200 resumed (implemented, B4)
GET  /assessments/:sessionId/reassessment-result     (implemented, B4)
POST /exams/:examId/assessments/full-reassessment    (implemented: see "Full re-diagnostic")
```

Server determines eligibility: the skill profile's `state: "READY_FOR_REASSESSMENT"` is the
eligibility (no separate endpoint). ADAPTIVE_ENGINE.md §12–§13; assumptions in OPEN_QUESTIONS.md #12e.

- Start: paid (`403 REASSESSMENT_REQUIRES_ACCESS`); the skill must be in the exam's published
  taxonomy (`404 SKILL_NOT_FOUND`; inactive exam `404 EXAM_NOT_AVAILABLE`) and READY_FOR_REASSESSMENT
  (`409 SKILL_NOT_READY_FOR_REASSESSMENT`, `details: { state, remainingAttempts | null }`). Five
  questions on the skill or its subskills, unseen first, nearest the student's level; fewer than five
  in the bank → `422 REASSESSMENT_NOT_ENOUGH_QUESTIONS`. One open reassessment per exam: another
  skill's open one → `409 REASSESSMENT_IN_PROGRESS`, `details: { sessionId }`.
- The session is `type: "SKILL_REASSESSMENT"`; the usual session routes apply. Answers get right /
  wrong only (no review) and add evidence as usual.
- Result (`422 ASSESSMENT_NOT_COMPLETED` before the end; another student's session `404`):

```json
{ "skill": { "id": "…", "name": "التناظر اللفظي" }, "passed": true, "correct": 5, "total": 5,
  "requiredCorrect": 4, "remainingAttempts": null }
```

- Pass = at least `requiredCorrect` (4/5) correct **and** the skill still READY after the
  reassessment's own evidence. A pass makes the skill MASTERED (every subskill, when it has them);
  evidence never undoes it. A failure holds the skill: the profile reads `DEVELOPING` with
  `reassessment: { remainingAttempts }` until five answers with evidence (skips do not count) reach
  it — training targets it meanwhile. Recorded once per session (`skill_reassessments`, migration
  0014).

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

Implemented in C2. Permission `audit.view` (ADMIN only). Windows are `days=7` or `days=30` (anything
else `400`).

```text
GET /admin/analytics/learning?days=7|30
GET /admin/analytics/content
GET /admin/analytics/imports?days=7|30
GET /admin/audit-logs?action&resourceType&resourceId&actorId&from&to&limit&offset
GET /admin/adaptive-decisions?sessionId=…
GET /admin/operations/outbox
```

- `learning` is computed from the analytics stream (`learning_events`, fed by the outbox worker; it
  lags until the worker drains): `{ days, activeStudents, diagnostics: { miniStarted, miniCompleted,
  fullStarted, fullCompleted }, trainingSessions, attempts: { answered, skipped, correctRate | null },
  reassessments: { passed, failed } }`.
- `content`: `{ questions: { STATUS: count } (newest version per question), reviewBacklog
  (UNDER_REVIEW + APPROVED), thinSkills: [{ examName, skillName, published }] }` — active skills of
  live exams with fewer than 5 published questions, fewest first, at most 20.
- `imports`: `{ days, batches: { STATUS: count }, rows: { imported, invalid, duplicate, skipped } }`.
- `audit-logs`: newest first; `{ items: [{ id, action, resourceType, resourceId, actor: { id, email,
  displayName } | null, requestId, metadata, createdAt }], page }`. Metadata is what was stored
  (redacted at write time).
- `adaptive-decisions`: `{ session: { id, type, status, examId, examName, studentId, createdAt },
  items: [{ itemOrdinal, answered, id, targetSkill { id, name }, masterySnapshot, confidenceSnapshot,
  targetDifficulty, reasons, candidates, selectedQuestionVersionId, engineVersion, configVersion,
  createdAt }] }`; unknown session `404 ASSESSMENT_NOT_FOUND`. No answer keys or attempt answers.
- `operations/outbox`: `{ pending, processing, failed, published24h, oldestPendingSeconds | null,
  recentFailures: [{ id, eventType, attempts, lastError, createdAt }] }`.

### Outbox events (ARCHITECTURE.md §10)

Written in the same transaction as the change; drained by the worker (`pnpm --filter @qup/api worker`)
into `learning_events` (payload schema `1`, ids only): `assessment.session.created`,
`assessment.attempt.recorded`, `assessment.session.completed`, `mastery.reassessment.recorded`,
`import.drafts.created`.

## AI Assistance

Implemented in C3 (AI_INTEGRATION.md; assumptions in OPEN_QUESTIONS.md #19a). Advisory only: the
server never writes a suggestion into a question. The author applies it in the editor and saves,
and the version goes through review as usual.

```text
GET  /admin/ai/status                                        questions.create
POST /admin/question-versions/:id/ai/metadata-suggestion     questions.create
POST /admin/question-versions/:id/ai/explanation-draft       questions.create
GET  /admin/ai/runs?limit&offset                             ai.manage
```

- `status`: `{ enabled, provider: "fake" | null, tasks: ["suggest_question_metadata",
  "draft_explanation"] | [] }`.
- `metadata-suggestion` reads the version's **saved** content: `{ suggestion: { skillId | null,
  subskillId | null, nodeName, difficulty: 0.25 | 0.5 | 0.75, rationale } }`. The node is always an
  active node of the version's taxonomy.
- `explanation-draft`: `{ draft: { explanation } }`. The model must restate the saved answer key, so
  a draft that explains a different answer is never returned.
- `runs`: newest first, `{ items: [{ id, task, promptVersion, schemaVersion, provider, model,
  status, attempts, latencyMs, inputTokens, outputTokens, errorCode, requestedBy: { id, email,
  displayName } | null, subjectType, subjectId, createdAt }], last24h: { SUCCEEDED, INVALID_OUTPUT,
  TIMED_OUT, FAILED }, page }`. Outputs and prompts are never listed.
- Errors:
  - `404 QUESTION_VERSION_NOT_FOUND`; `409 AI_REQUIRES_DRAFT`; `422 AI_NO_SKILLS`.
  - `503 AI_UNAVAILABLE` when AI is off or the provider failed.
  - `503 AI_OUTPUT_INVALID` when every attempt broke the schema or the grounding check.
  - `503 AI_TIMEOUT`.

  Every run that reached the provider is recorded in `ai_runs`, whatever its outcome.
- Rate limit: `AI_RATE_LIMIT_PER_MINUTE` (20) per IP across both POST routes, then `429`.

## Internal Application Services

داخل monolith لا تستخدم HTTP-to-self.

Examples:
- `MasteryService.applyAttemptEvidence`
- `AdaptiveService.selectNextQuestion`
- `EntitlementService.hasExamAccess`
- `QuestionPublicationService.publishVersion`
