# Observability

## Goals

We should be able to answer:
- ماذا حدث؟
- لأي student/session؟
- بأي algorithm/config version؟
- لماذا اختير هذا السؤال؟
- أين فشل import/payment/AI؟

## Structured Logs

Use Pino.

Common fields:
- timestamp
- level
- environment
- request_id
- trace_id
- user_id when permitted
- module
- action
- error_code

Learning fields:
- exam_id
- assessment_session_id
- item_id
- attempt_id
- adaptive_decision_id
- algorithm_version
- config_version

## Metrics

Platform:
- request latency/error rate.
- DB latency/pool.
- queue depth/failures.
- worker duration.

Learning:
- diagnostic starts/completions.
- attempts.
- gap closure.
- reassessment pass/fail.
- questions-to-mastery.
- mastery change distribution.
- question exposure.

Content:
- import success/fail.
- review backlog.
- duplicate detections.

AI:
- calls/latency/timeouts.
- schema failures.
- provider failures.
- cost/usage when available.

Payments:
- start/success/failure.
- webhook signature failures.
- entitlement grant failures.

## Tracing

OpenTelemetry across:
- HTTP.
- DB.
- queue jobs.
- provider calls.
- import pipeline.

Propagate trace context to workers.

## Sentry

Capture frontend/backend unhandled errors with environment/release metadata and sensitive-data scrubbing.

## Audit Log vs App Log

Audit = durable business/security record.
App log = operational diagnostics.
One does not replace the other.

## V1 Implementation (C2, 2026-10-21)

- Structured logs: Pino (nestjs-pino) with request ids, as before.
- Transactional outbox: `outbox_events` written with the change; drained by the worker into the
  `learning_events` analytics stream (API_CONTRACTS.md "Outbox events").
- Admin metrics (`/admin/analytics`): learning (from the stream), question bank backlog and thin
  skills, imports, and outbox depth/age/failures ("queue depth/failures").
- Audit log viewer (`/admin/audit`) and adaptive decision audit per session
  (`/admin/adaptive-decisions`).
- Not yet: OpenTelemetry tracing, Sentry, a metrics endpoint for scraping, payment/AI metrics
  (OPEN_QUESTIONS.md #21a).

## Alerts (C4, 2026-10-21)

No monitoring vendor is chosen yet (OPEN_QUESTIONS.md #21b). [RUNBOOK.md](RUNBOOK.md) §1 lists each
alert with where to read it, when to act and the first step:

- readiness;
- server errors;
- outbox backlog and failures;
- AI failures (`/admin/ai`);
- stuck payments;
- rate limiting.

When a vendor is chosen, each row becomes an alert rule. The `requestId` that every log line, error
response and audit entry already carries is what joins them.

## Adaptive Decision Audit

Persist:
- target gap/node.
- mastery/confidence snapshot.
- target difficulty.
- bounded candidate snapshot/scores.
- selected question.
- reason codes.
- engine/config version.
