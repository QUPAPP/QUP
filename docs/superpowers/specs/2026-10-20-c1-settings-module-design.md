# C1 — Versioned system settings (design)

Status: written 2026-10-20 under the user's standing instruction to proceed without per-step
approval. Roadmap slice C1 (after A1, A2).

## Goal

Admins change product settings from the panel without a deploy, and every change is versioned so
past results stay explainable. The first setting is the one the product owner already asked to be
admin-editable: the **preliminary result level boundaries** (OPEN_QUESTIONS.md #10b: "حدود المستويات
قابلة للتعديل لاحقًا من لوحة الإدارة"; defaults #10c).

## Decisions

- **Storage:** the existing `system_settings` table (typed, `(key, version)` unique). Each change
  inserts the next version; nothing is overwritten. No row = version 0 = the code default.
- **Registry:** the settings module owns a typed registry of known keys — key, value type, Zod
  validator, default, description. Unknown keys are rejected. V1 registers one key:
  `assessment.preliminaryResult.levels`.
- **Validation of the levels:** exactly the five levels in order (NEEDS_FOUNDATION, BEGINNER,
  INTERMEDIATE, GOOD, ADVANCED); `fromPercentage` integers 0–100; the first is 0; strictly
  increasing. Invalid → `422 SETTING_VALUE_INVALID` with details.
- **Concurrency:** `PUT` carries `expectedVersion`; a stale write is `409 SETTING_VERSION_CONFLICT`
  (the unique index is the backstop).
- **Audit:** each change writes `settings.update` to `audit_logs` with key and versions.
- **Permission:** new `settings.manage`, ADMIN only (least privilege; #16 — who edits engine config —
  stays open). Seeded by migration.
- **History stays explainable:** a session records the levels version in effect when it was
  created (`assessment_sessions.result_config_version`, nullable; NULL = code default). Its result is
  always computed with that version, so a later change never relabels a past result.
- **Not in C1:** mastery engine config (#16 open), re-diagnostic and reassessment settings (land with
  B4), per-exam overrides.

## API

```text
GET /admin/settings                      → { items: [{ key, description, valueType, version, value, updatedAt, updatedBy }] }
GET /admin/settings/:key/versions        → { items: [{ version, value, updatedAt, updatedBy }] }  newest first, version 0 = default
PUT /admin/settings/:key                 { expectedVersion, value } → the new current setting
```

Unknown key: `404 SETTING_NOT_FOUND`. Contract for other modules (`settings.contract.ts`):
`SETTINGS_READER.current(key)` → `{ version, value }`; `SETTINGS_READER.atVersion(key, version | null)`
→ value (null/0 → default).

## Migrations

- `0010_settings_permission`: insert `settings.manage`, grant to ADMIN (idempotent).
- `0011_session_result_config_version`: `ALTER TABLE assessment_sessions ADD COLUMN
  result_config_version integer` (nullable; no backfill — NULL means the default every existing
  session was scored with).

## Web

`/admin/settings` (settings.manage): the five level boundaries as integer inputs (the first fixed at
0), current version and last change, save with the expected version, Arabic errors for
`SETTING_VALUE_INVALID` / `SETTING_VERSION_CONFLICT`, and the version history. Nav item "الإعدادات".

## Tests

DB: permission seed. API e2e: list/history/update, validation, conflict, audit row, 403 for managers,
404 unknown key; a completed session's result keeps its level after the boundaries change while a new
session uses the new ones. API unit: the levels validator. Web unit: client, form conversion, messages,
nav. Browser: edit, save, conflict, history.
