# C2 — Outbox worker, metrics and audit screens

Date: 2026-10-21. Branch: `ahmeddev`. Executed on the user's request ("كمّل بالشريحة C2"). Assumed
rules are recorded in `OPEN_QUESTIONS.md` #21a.

## Why

- `AGENTS.md` §7: "Outbox للأحداث غير المتزامنة الحرجة". `ARCHITECTURE.md` §10 describes a business
  write plus `outbox_events` in one transaction, which a worker then drains.
- The `outbox_events` and `learning_events` tables exist, but nothing writes or drains them.
- `OBSERVABILITY.md` asks for:
  - learning metrics (diagnostic starts and completions, attempts, reassessment pass/fail);
  - content metrics (review backlog, imports, duplicates);
  - queue depth and failures;
  - an adaptive decision audit an operator can read.
- `API_CONTRACTS.md` lists `GET /admin/analytics/*` and `GET /admin/audit-logs`. Today an admin can
  only read these through SQL.

## What gets built

### 1. Transactional outbox and worker

- **Writer:** `writeOutbox(executor, event)` runs beside `writeAudit` in the same transaction as the
  business change. Events (payload schema `1`, no personal data beyond ids):

  | Event | Written in | Payload |
  | --- | --- | --- |
  | `assessment.attempt.recorded` | the answer transaction | sessionId, sessionType, examId, studentId, itemId, attemptId, resultType, isCorrect |
  | `assessment.session.completed` | the answer transaction (auto) and `complete` | sessionId, sessionType, examId, studentId |
  | `mastery.reassessment.recorded` | the reassessment outcome transaction | sessionId, studentId, examId, skillId, passed, correct, total |
  | `import.drafts.created` | the batch's final update | batchId, imported, rejected |

- **Relay:** `OutboxRelay.drain(limit)` loops over these steps:
  1. Claim due `PENDING` rows with `FOR UPDATE SKIP LOCKED`, marking them `PROCESSING`. Several
     workers never take the same row.
  2. Run each row's handlers.
  3. On success, mark the row `PUBLISHED`.
  4. On failure:
     - `attempts + 1`, keep `last_error`, set `available_at = now + backoff`;
     - backoff is `min(2^attempts × 5 s, 10 min)`;
     - after 8 attempts the row becomes `FAILED`.

  A row stuck in `PROCESSING` for more than 5 minutes (a crashed worker) goes back to `PENDING`.
- **First handler:** the learning-event projector. It copies each event into `learning_events`
  (`id` = outbox id, so it is idempotent; `schema_version` `1`; `occurred_at` = the event's time).
  This is the analytics stream; notifications and AI jobs plug in the same way later.
- **Worker process:**
  - `apps/api/src/worker.ts` is a Nest application context with no HTTP. It polls every 2 s and
    stops cleanly on SIGTERM.
  - It runs with `pnpm --filter @qup/api worker`, plus a "worker" entry in `.claude/launch.json`.
  - Deploying it on CranL as a second process is a later, explicit step.

### 2. Admin read APIs (permission `audit.view`, ADMIN)

```text
GET /admin/audit-logs?action&resourceType&resourceId&actorId&from&to&limit&offset
GET /admin/adaptive-decisions?sessionId=… | studentId=…&limit&offset
GET /admin/analytics/learning?days=7|30
GET /admin/analytics/content
GET /admin/analytics/imports?days=7|30
GET /admin/operations/outbox
```

- **Audit logs:** newest first. Each entry is `{ id, action, resourceType, resourceId, actor: { id,
  email, displayName } | null, requestId, metadata, createdAt }`.
- **Adaptive decisions** (owned by the adaptive module): each is `{ id, sessionId, itemOrdinal,
  targetSkill { id, name }, masterySnapshot, confidenceSnapshot, targetDifficulty, reasons,
  candidates, selectedQuestionVersionId, engineVersion, configVersion, createdAt }`.
- **Learning:**
  - `activeStudents`;
  - `diagnostics { miniStarted, miniCompleted, fullStarted, fullCompleted }`;
  - `trainingSessions`;
  - `attempts { answered, skipped, correctRate }`;
  - `reassessments { passed, failed }`.
- **Content:**
  - `questions { DRAFT, UNDER_REVIEW, APPROVED, PUBLISHED, ARCHIVED }` (latest version per question);
  - `reviewBacklog` (UNDER_REVIEW + APPROVED);
  - `thinSkills`: active skills of published taxonomies with fewer than 5 published questions,
    fewest first, at most 20.
- **Imports:** `batches` by status and `rows { imported, invalid, duplicate, skipped }` over the
  window.
- **Outbox:** `{ pending, processing, failed, published24h, oldestPendingSeconds }`, plus the last
  10 failures `{ id, eventType, attempts, lastError, createdAt }`.

All of them are computed from the source tables with bounded queries. Windows are 7 or 30 days
only (`400` otherwise).

### 3. Admin screens

- `/admin/analytics` ("المؤشرات") shows learning, content, imports and outbox cards, with a 7/30-day
  switch.
- `/admin/audit` ("سجل التدقيق") is a filterable, paginated list with expandable metadata.
- `/admin/adaptive-decisions` ("قرارات التدريب") takes a session id from the URL (`?sessionId=`) or a
  search box, and lists each decision with its reasons in Arabic, its numbers and its candidates.

## Out of scope

- Redis/BullMQ (OPEN_QUESTIONS #21a);
- OpenTelemetry tracing and Sentry (C4);
- a Prometheus `/metrics` endpoint;
- exposure analytics per question.

## Testing

- Integration, with the relay against the real database:
  - a business answer writes its outbox rows;
  - `drain` publishes them and projects `learning_events` exactly once, even when drained twice;
  - a failing handler is retried with backoff and ends `FAILED` after the maximum attempts;
  - two concurrent drains never handle a row twice;
  - a stale `PROCESSING` row is reclaimed.
- E2E:
  - each admin route is 401 when signed out and 403 for a content manager or student;
  - audit filters;
  - decisions for a training session;
  - learning numbers after a seeded scenario;
  - the content backlog and thin skills;
  - import rows;
  - outbox counts;
  - a bad window is 400.
- Web unit: client paths, reason-code labels, window switch.
- Browser: an admin sees metrics, filters the audit log, and opens decisions for a training session.
