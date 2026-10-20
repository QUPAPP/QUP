# C1 — Versioned System Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Admins edit the preliminary-result level boundaries from the panel, versioned and audited, without relabelling past results.

**Architecture:** A `settings` module (typed registry → Drizzle store over `system_settings` → service → admin controller, plus a `SETTINGS_READER` contract). Assessments record the levels version on each new session and score results with it. Two migrations: a permission seed and a nullable column. Web: one admin page.

**Spec:** `docs/superpowers/specs/2026-10-20-c1-settings-module-design.md`

## Global Constraints

- Migrations are additive; never run against CranL. `pnpm db:migrate` locally only.
- `settings.manage` is ADMIN only. Unknown keys are rejected. Values validated by the registry's Zod schema.
- Settings never change a past result: a session's result uses the version recorded on it.
- Web: Arabic errors from codes; RTL; labelled inputs; single-flight saves.
- Commits on `ahmeddev` with the Co-Authored-By line; no push.

## Review Focus

1. **Two admins saving at once:** the second gets `SETTING_VERSION_CONFLICT` in Arabic and sees the new current values (Task 4).
2. **Boundaries out of order or not starting at 0:** refused with `SETTING_VALUE_INVALID` before anything is stored (Task 2).
3. **A result read after a boundary change:** unchanged for sessions created before it (Task 3).
4. **No stored setting yet:** the default is version 0 everywhere (Task 2).

### Task 1: Permission and column migrations

**Files:** `apps/api/src/modules/rbac/permissions.ts` (`SettingsManage: "settings.manage"`), `packages/db/src/schema/assessment.ts` (`resultConfigVersion: integer("result_config_version")`), generated `packages/db/migrations/0010_*.sql` (column), custom `0011_settings_permission.sql` (seed, idempotent, ADMIN grant).

- [ ] Add the permission to code; run `auth.e2e` → FAIL (seed lacks it).
- [ ] `pnpm --filter @qup/db exec drizzle-kit generate --name session_result_config_version` (column) and `… generate --custom --name settings_permission` (seed SQL); `pnpm db:migrate && pnpm db:verify`.
- [ ] `auth.e2e` and `admin-bootstrap.e2e` → PASS; commit `Add the settings.manage permission and a session result config version`.

### Task 2: Settings module (API)

**Files:** create `apps/api/src/modules/settings/` — `domain/setting-definitions.ts` (registry: `SETTING_KEYS`, `SETTING_DEFINITIONS`, `PreliminaryLevelsValue`, `parseSettingValue(key, value)`), `domain/settings.errors.ts` (`SettingNotFound` 404 `SETTING_NOT_FOUND`, `SettingValueInvalid` 422 `SETTING_VALUE_INVALID`, `SettingVersionConflict` 409 `SETTING_VERSION_CONFLICT`), `domain/ports.ts` (`SettingsStore`), `infrastructure/drizzle-settings-store.ts`, `application/settings.service.ts`, `presentation/admin-settings.controller.ts` (+ DTOs), `settings.contract.ts` (`SETTINGS_READER`), `settings.module.ts`; register in `app.module.ts`; `AuditAction.SettingUpdated = "settings.update"`; tests `apps/api/test/settings/setting-definitions.test.ts`, `settings.e2e.test.ts`.

- [ ] Unit tests: the default levels parse; rejected — first ≠ 0, not increasing, non-integer, > 100, a level missing or out of order.
- [ ] E2E tests: list shows the key at version 0 with the default; PUT with `expectedVersion: 0` → version 1 and audit row; history newest first ending with version 0; stale `expectedVersion` → 409; invalid value → 422 with details; unknown key → 404; content manager → 403.
- [ ] Implement; `pnpm --filter @qup/api test` → PASS; document in API_CONTRACTS.md; commit `Add versioned system settings`.

### Task 3: Pin the levels version on each session

**Files:** `apps/api/src/modules/assessments/domain/ports.ts` (`Session.resultConfigVersion`, `createSession` input), `infrastructure/drizzle-assessment-store.ts`, `application/assessments.service.ts` (read `SETTINGS_READER.current` at creation; `atVersion` in `result`), `assessments.module.ts` (import `SettingsModule`), `domain/assessment-config.ts` (levels default comes from the settings registry); test `apps/api/test/assessments/assessments.e2e.test.ts`.

- [ ] E2E test: complete a mini diagnostic → level L; admin moves the boundaries so that percentage maps elsewhere; the same session's result is still L; a new student's session records the new version (`result_config_version` = 1 in the DB).
- [ ] Implement → PASS + API suite; commit `Score each session with the level boundaries it started under`.

### Task 4: Web settings page

**Files:** `apps/web/src/lib/settings-api.ts`, `apps/web/src/lib/settings-form.ts` (`LEVEL_LABELS`, `levelsFormSchema`, `toLevelsValue`), `apps/web/src/lib/permissions.ts` (`settingsManage`, nav "الإعدادات"), `apps/web/src/lib/messages.ts` (three codes), `apps/web/src/app/admin/settings/page.tsx`; tests `apps/web/test/settings.test.ts`, `permissions.test.ts`.

- [ ] Tests: client paths/methods; form → value conversion; schema rejects non-integers and > 100 (order and the first-is-0 rule stay the API's); admin nav includes `/admin/settings`, content manager's does not; messages in Arabic.
- [ ] Implement page: five inputs (first read-only 0), version + last change, save (single-flight; conflict refetches), history.
- [ ] Web tests + typecheck + Biome → PASS; commit `Add the admin settings page`.

### Task 5: Docs, gates, browser, review

- [ ] README (web), IMPLEMENTATION_STATUS (C1), OPEN_QUESTIONS (#10c note: boundaries now editable, versioned).
- [ ] `pnpm typecheck && pnpm check && pnpm test && pnpm build`.
- [ ] Browser: edit boundaries, save, history; conflict by saving from a stale page; preliminary result of an old session unchanged.
- [ ] Commit docs; self-review; report.
