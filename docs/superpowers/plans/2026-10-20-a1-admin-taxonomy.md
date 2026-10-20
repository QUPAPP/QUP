# A1 — Admin Panel and Taxonomy Tree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admin with `taxonomy.manage` builds and publishes an exam's taxonomy entirely from the web app.

**Architecture:** Three additive API routes in the existing `catalog` module (DTO → controller → service → `CatalogStore` port → Drizzle adapter; no migration). In the web app, an `/admin` area with its own shell, permission-gated from `/auth/me`, client pages using TanStack Query and React Hook Form + Zod, all logic-bearing helpers in `src/lib/` with Vitest tests.

**Tech Stack:** NestJS + Fastify, Drizzle, PostgreSQL 16, Zod 4, Vitest; Next.js 16 App Router, React, TanStack Query, React Hook Form, Biome, pnpm 10, Turbo.

**Spec:** `docs/superpowers/specs/2026-10-20-a1-admin-taxonomy-design.md`

## Global Constraints

- No database migration; no change to existing routes' behaviour or response shapes.
- Every new API route is covered by the controller's class-level `@RequirePermissions(Permission.TaxonomyManage)`.
- DTOs are `z.strictObject`; `code` is never editable; field rules reuse `weight`, `masteryThreshold`, `displayOrder` from `apps/api/src/common/validation/schemas.ts`.
- No new API error codes; reuse `catalog.errors.ts` (`ExamNotFound`, `TaxonomyNodeNotFound`, `TaxonomyVersionNotDraft`, …).
- Web: no business rule in the browser; server state only in TanStack Query; every account-bound query key includes the user id; errors shown via `errorMessage()` in Arabic, never raw server text.
- Web: RTL, keyboard reachable, labelled inputs with linked errors, status as text not only colour, no horizontal scroll at 320 px; tokens/components from `apps/web/DESIGN.md`.
- Read the relevant guide in `apps/web/node_modules/next/dist/docs/` before writing routes or layouts (Next.js 16).
- Tests run against the local PostgreSQL 16 `qup_db`, never the CranL database.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; commit on `ahmeddev`; do not push.

## Review Focus

1. **Double submit** (double-click "add domain"): the second request must not create a duplicate or show a confusing error — submit buttons are disabled while their mutation is pending (Task 8, verified in Task 9's browser pass).
2. **Draft published by another admin mid-edit**: the stale edit returns `422 TAXONOMY_VERSION_NOT_DRAFT`; the user sees the Arabic message and the refetched tree turns read-only (e2e in Task 2, message in Task 6, refetch-on-error in Task 8).
3. **Session expires mid-edit**: a mutation returning `401 UNAUTHENTICATED` shows "انتهت الجلسة" instead of failing silently (client test in Task 4).
4. **Threshold precision**: 85.55 % has more precision than the API accepts (3 decimals as a share); the form rejects it before sending, 85.5 % sends exactly `0.855` (Task 6).
5. **Long names at 320 px**: a 120-character skill name wraps inside its tree row without horizontal scroll (Task 8 CSS, Task 9 browser pass).

---

### Task 0: Local toolchain and database baseline

No code change and no commit. Establishes that the existing suite passes before anything changes.

- [ ] **Step 1: Enable pnpm 10.33.2 and install**

Run: `corepack enable --install-directory ~/.local/bin && pnpm --version && pnpm install --frozen-lockfile`
Expected: `10.33.2`, install completes without lockfile changes (`git status` clean).

- [ ] **Step 2: Create the local database and `.env`**

Run: `createdb qup_db` (Homebrew `postgresql@16` is running). Write the repo-root `.env` (git-ignored) with
`DATABASE_URL=postgresql://localhost:5432/qup_db` and `TEST_DATABASE_URL=postgresql://localhost:5432/qup_db`
(the migrate guard requires the database name `qup_db`).

- [ ] **Step 3: Migrate and verify**

Run: `pnpm db:migrate && pnpm db:verify`
Expected: "Migrations applied." and a clean verify.

- [ ] **Step 4: Baseline gates**

Run: `pnpm typecheck && pnpm check && pnpm test`
Expected: all pass. If anything fails, stop and report the failure before Task 1 — it is pre-existing.

---

### Task 1: API — list an exam's taxonomy versions

**Files:**
- Modify: `apps/api/src/modules/catalog/domain/ports.ts` (CatalogStore, "Taxonomy versions" group)
- Modify: `apps/api/src/modules/catalog/infrastructure/drizzle-catalog-store.ts`
- Modify: `apps/api/src/modules/catalog/application/taxonomy.service.ts`
- Modify: `apps/api/src/modules/catalog/presentation/admin-exams.controller.ts`
- Modify: `API_CONTRACTS.md` ("Exams — Admin" route list)
- Test: `apps/api/test/catalog/catalog.e2e.test.ts`

**Interfaces:**
- Produces: `CatalogStore.listTaxonomyVersions(examId: string): Promise<TaxonomyVersion[]>` (ordered `createdAt` desc, `id` desc); `TaxonomyService.listVersions(examId: string): Promise<TaxonomyVersion[]>` (throws `ExamNotFound` when `store.findExam` is null); route `GET /admin/exams/:id/taxonomy-versions` → `{ items: TaxonomyVersionView[] }`.

- [ ] **Step 1: Write the failing e2e tests** in a new `describe("taxonomy versions list")`:
  - `it("lists an exam's versions newest first")`: create an exam, then versions `v1` and `v2`; `GET /admin/exams/:id/taxonomy-versions` as admin → `200`, `items.map(v => v.versionCode)` equals `["v2", "v1"]`, each item has `status: "DRAFT"` and the exam's `examId`.
  - `it("returns 404 for an unknown exam")`: random UUID → `404`, `code(res) === "EXAM_NOT_FOUND"`.
  - `it("refuses content managers and students")`: both → `403`, code `"FORBIDDEN"`.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @qup/api exec vitest run test/catalog/catalog.e2e.test.ts -t "taxonomy versions list"`
Expected: FAIL (404 route not found for the success case).

- [ ] **Step 3: Implement** the store method (select `versionColumns` from `taxonomyVersions` where `examId`, `orderBy(desc(createdAt), desc(id))`), the service method, and the controller method `listTaxonomyVersions(@Param("id", uuid) examId)` returning `{ items: versions.map(toVersionView) }`, with `@ApiOperation({ summary: "The exam's taxonomy versions, newest first, in every status." })` and a one-line comment that versions per exam stay few (same reason as `list()`).

- [ ] **Step 4: Run to verify they pass** (same command). Expected: PASS.

- [ ] **Step 5: Document** the route under "Exams — Admin" in `API_CONTRACTS.md` (ordering, 404, no pagination and why).

- [ ] **Step 6: Commit** — `git add` the six files; message `Add GET /admin/exams/:id/taxonomy-versions`.

---

### Task 2: API — edit domains and subskills

**Files:**
- Modify: `apps/api/src/modules/catalog/presentation/catalog.dto.ts`
- Modify: `apps/api/src/modules/catalog/domain/ports.ts`
- Modify: `apps/api/src/modules/catalog/infrastructure/drizzle-catalog-store.ts`
- Modify: `apps/api/src/modules/catalog/application/taxonomy.service.ts`
- Modify: `apps/api/src/modules/catalog/presentation/admin-taxonomy.controller.ts`
- Modify: `API_CONTRACTS.md` ("Taxonomy" route list)
- Test: `apps/api/test/catalog/catalog.e2e.test.ts`

**Interfaces:**
- Produces: DTOs `updateDomainBody` (`name?`, `description?` nullable, `weight?`, `displayOrder?`) and `updateSubskillBody` (same plus `masteryThreshold?` nullable), both `.refine(atLeastOneField, …)`; types `DomainChanges`, `SubskillChanges` in `ports.ts`; `CatalogStore.updateDomain(domainId: string, changes: DomainChanges): Promise<void>` and `updateSubskill(subskillId: string, changes: SubskillChanges): Promise<void>`; `TaxonomyService.updateDomain(domainId, changes)` / `updateSubskill(subskillId, changes)` doing `requireDraft(await this.versionOf(type, id))` first; routes `PATCH /admin/domains/:id`, `PATCH /admin/subskills/:id` → `204`.

- [ ] **Step 1: Write the failing e2e tests** in `describe("editing domains and subskills")` (build a DRAFT version with one domain → skill → subskill in `beforeAll`):
  - `it("renames a domain and changes its weight")`: PATCH `{ name: "مجال معدل", weight: 2.5 }` → `204`; tree shows the new name and `weight: 2.5`.
  - `it("sets and clears a subskill threshold")`: PATCH `{ masteryThreshold: 0.9 }` → tree `0.9`; PATCH `{ masteryThreshold: null }` → tree `null`.
  - `it("rejects an empty body and an attempt to change code")`: `{}` → `400 VALIDATION_FAILED`; `{ code: "X" }` → `400 VALIDATION_FAILED`.
  - `it("returns 404 for an unknown node")`: random UUID on both routes → `404 TAXONOMY_NODE_NOT_FOUND`.
  - `it("refuses edits once the version is published")`: on a published version's domain → `422 TAXONOMY_VERSION_NOT_DRAFT` (Review Focus 2).
  - `it("refuses content managers")`: `403 FORBIDDEN`.

  The spec's "API unit: service paths that call `requireDraft`" is pinned by the `422` e2e cases here
  and in Task 3: the catalog module has no in-memory `CatalogStore`, and adding one only for this
  would test a fake rather than the database guard that also enforces the rule.

- [ ] **Step 2: Run to verify they fail** — `… -t "editing domains and subskills"`. Expected: FAIL.

- [ ] **Step 3: Implement** following `updateSkill` exactly (store: `guarded`, `toWeight` / `toThreshold` conversions; controller: `@Patch`, `@HttpCode(NO_CONTENT)`, `ZodValidationPipe(uuidParam)` and the new body schemas).

- [ ] **Step 4: Run to verify they pass.** Expected: PASS.

- [ ] **Step 5: Document** both routes in `API_CONTRACTS.md` "Taxonomy" (editable fields, `code` immutable, DRAFT only).

- [ ] **Step 6: Commit** — message `Allow editing domains and subskills in a draft taxonomy`.

---

### Task 3: API — remove a prerequisite

**Files:**
- Modify: `apps/api/src/modules/catalog/domain/ports.ts`
- Modify: `apps/api/src/modules/catalog/infrastructure/drizzle-catalog-store.ts`
- Modify: `apps/api/src/modules/catalog/application/taxonomy.service.ts`
- Modify: `apps/api/src/modules/catalog/presentation/admin-taxonomy.controller.ts`
- Modify: `API_CONTRACTS.md`
- Test: `apps/api/test/catalog/catalog.e2e.test.ts` (extend the file's `Method` type with `"DELETE"`)

**Interfaces:**
- Produces: `CatalogStore.removePrerequisite(skillId: string, prerequisiteSkillId: string): Promise<void>` (plain `delete … where skillId and prerequisiteSkillId`, inside `guarded`; no rows is fine); `TaxonomyService.removePrerequisite(skillId: string, prerequisiteSkillId: string): Promise<void>` with `requireDraft(await this.versionOf("skill", skillId))`; route `DELETE /admin/skills/:id/prerequisites/:prerequisiteSkillId` → `204`, both params `uuidParam`.

- [ ] **Step 1: Write the failing e2e tests** in `describe("removing prerequisites")` (DRAFT version, skills A and B, A requires B):
  - `it("removes a prerequisite")`: DELETE → `204`; tree's A has `prerequisites: []`.
  - `it("is idempotent")`: DELETE again → `204`.
  - `it("returns 404 for an unknown skill")`: → `404 TAXONOMY_NODE_NOT_FOUND`.
  - `it("refuses removal once the version is published")`: → `422 TAXONOMY_VERSION_NOT_DRAFT`.
  - `it("refuses content managers")`: → `403 FORBIDDEN`.

- [ ] **Step 2: Run to verify they fail.** Expected: FAIL.
- [ ] **Step 3: Implement** as in Interfaces; `@ApiOperation({ summary: "Remove a prerequisite link from a DRAFT skill. Idempotent." })`.
- [ ] **Step 4: Run to verify they pass**, then the whole API suite: `pnpm --filter @qup/api test`. Expected: PASS.
- [ ] **Step 5: Document** in `API_CONTRACTS.md` (idempotent `204`, DRAFT only).
- [ ] **Step 6: Commit** — message `Allow removing a prerequisite from a draft taxonomy`.

---

### Task 4: Web — API client for the admin panel

**Files:**
- Modify: `apps/web/src/lib/api.ts` (`RequestOptions.method` adds `"PATCH" | "DELETE"`; `Me` type; `getMe` returns `Me`)
- Create: `apps/web/src/lib/admin-api.ts`
- Test: `apps/web/test/admin-client.test.ts`

**Interfaces:**
- Produces in `api.ts`: `interface Me { user: User; roles: string[]; permissions: string[] }`; `getMe(): Promise<Me>`.
- Produces in `admin-api.ts` (types mirror the API views in `catalog.views.ts` and `ports.ts`): `AdminExam`, `ExamStatus`, `TaxonomyVersion`, `VersionStatus`, `NodeStatus`, `NodeType`, `TaxonomyTree`, `DomainNode`, `SkillNode`, `SubskillNode`; calls `listAdminExams()`, `createExam(body)`, `updateExam(examId, body)`, `listTaxonomyVersions(examId)`, `createTaxonomyVersion(examId, body)`, `getTaxonomyTree(versionId)`, `publishTaxonomyVersion(versionId)`, `createDomain(body)`, `createSkill(body)`, `createSubskill(body)`, `updateDomain(id, changes)`, `updateSkill(id, changes)`, `updateSubskill(id, changes)`, `archiveNode(type, id)`, `addPrerequisite(skillId, body)`, `removePrerequisite(skillId, prerequisiteSkillId)` — each one `api<…>()` call to the route in API_CONTRACTS.md.

- [ ] **Step 1: Write the failing tests:**
  - `it("edits a domain with PATCH and a JSON body")`: `updateDomain("d1", { name: "ج" })` → fetch called with `"/api/v1/admin/domains/d1"`, `method: "PATCH"`, `body: JSON.stringify({ name: "ج" })`, resolves `undefined` on `204`.
  - `it("removes a prerequisite with DELETE and no body")`: `removePrerequisite("s1", "s2")` → `"/api/v1/admin/skills/s1/prerequisites/s2"`, `method: "DELETE"`, no `body` property.
  - `it("lists an exam's taxonomy versions")`: path `"/api/v1/admin/exams/e1/taxonomy-versions"`, returns the stubbed `{ items }`.
  - `it("surfaces an expired session as UNAUTHENTICATED")` (Review Focus 3): `401 { error: { code: "UNAUTHENTICATED" } }` on `publishTaxonomyVersion("v1")` → rejects with `{ code: "UNAUTHENTICATED", status: 401 }`.
  - `it("keeps permissions from /auth/me")`: `getMe()` resolves with `permissions: ["taxonomy.manage"]`.

- [ ] **Step 2: Run to verify they fail** — `pnpm --filter @qup/web exec vitest run test/admin-client.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `admin-api.ts` and the `api.ts` changes.
- [ ] **Step 4: Run to verify they pass**, plus `pnpm --filter @qup/web typecheck`. Expected: PASS (existing callers of `getMe` still compile — `session.ts` reads `.user`).
- [ ] **Step 5: Commit** — message `Add the admin API client to the web app`.

---

### Task 5: Web — permissions, access guard and admin shell

**Files:**
- Create: `apps/web/src/lib/permissions.ts`
- Modify: `apps/web/src/lib/session.ts`
- Modify: `apps/web/src/lib/navigation.ts`
- Create: `apps/web/src/components/admin-shell.tsx`
- Create: `apps/web/src/app/admin/layout.tsx`
- Modify: `apps/web/src/components/app-shell.tsx` (admin link), `site-header.tsx`, `site-footer.tsx` (hide on admin paths)
- Modify: `apps/web/src/app/globals.css` (only if the admin shell needs a modifier the workspace classes lack)
- Test: `apps/web/test/permissions.test.ts`, `apps/web/test/navigation.test.ts`

**Interfaces:**
- Consumes: `Me`, `getMe` (Task 4).
- Produces in `permissions.ts`: `ADMIN_PERMISSIONS = { taxonomyManage: "taxonomy.manage" } as const`; `hasPermission(me: Me | null | undefined, code: string): boolean`; `hasAdminAccess(me: Me | null | undefined): boolean` (any value of `ADMIN_PERMISSIONS`); `adminNavItems(me): { href: string; title: string; icon: IconName }[]` — A1 has one item `{ href: "/admin/exams", title: "الاختبارات والتصنيف", icon: "book" }` shown only with `taxonomy.manage`.
- Produces in `session.ts`: `useMe()` (query key `ME_QUERY_KEY`, returns `Me | null`); `useCurrentUser()` keeps its signature by selecting `.user` from the same query; `useRequirePermission(code: string): { me: Me | null; allowed: boolean; ready: boolean }` (redirects to `/login` when there is no session, like `useRequireUser`).
- Produces in `navigation.ts`: `isAdminPath(path: string): boolean` (`/admin` and below).
- Produces `AdminShell({ children })`: sidebar "لوحة الإدارة" with `adminNavItems(me)`, a "العودة إلى مساحتي" link to `/dashboard`, mobile navigation, `#main-content` landmark — reusing the workspace classes from `app-shell.tsx`.

- [ ] **Step 1: Write the failing tests:**
  - `permissions.test.ts`: `hasPermission(null, "taxonomy.manage") === false`; admin `Me` → `true`; student `Me` (`permissions: []`) → `hasAdminAccess === false`; content manager with only `questions.create` → `hasAdminAccess === false` in A1 and `adminNavItems` is `[]`; admin → `adminNavItems` hrefs equal `["/admin/exams"]`.
  - `navigation.test.ts`: `isAdminPath("/admin") === true`, `isAdminPath("/admin/exams/x") === true`, `isAdminPath("/administrator") === false`, and `isWorkspacePath("/admin") === false`.

- [ ] **Step 2: Run to verify they fail.** Expected: FAIL.
- [ ] **Step 3: Read** `apps/web/node_modules/next/dist/docs/` on layouts and client navigation; then implement the lib functions, hooks, `AdminShell`, `app/admin/layout.tsx` (client layout rendering `AdminShell`), the admin link in `AppShell` (only when `hasAdminAccess`), and the `isAdminPath` early return in `SiteHeader`/`SiteFooter`.
- [ ] **Step 4: Run to verify they pass**, plus web typecheck. Expected: PASS.
- [ ] **Step 5: Commit** — message `Add the permission-gated admin shell`.

---

### Task 6: Web — admin form schemas and Arabic messages

**Files:**
- Create: `apps/web/src/lib/admin-forms.ts`
- Modify: `apps/web/src/lib/messages.ts`
- Test: `apps/web/test/admin-forms.test.ts`

**Interfaces:**
- Produces in `admin-forms.ts`: Zod schemas `examCreateSchema`, `examEditSchema`, `versionCreateSchema`, `domainFormSchema`, `skillFormSchema`, `subskillFormSchema` with inferred types `ExamCreateForm`, …; `percentToShare(percent: number): number` and `shareToPercent(share: number): number`.
- Field rules (copied from the API DTOs, `catalog.dto.ts` / `schemas.ts`): exam `code` `/^[A-Z][A-Z0-9_]{1,31}$/`, `slug` `/^[a-z0-9]+(-[a-z0-9]+)*$/` max 64, names 1–120, description ≤ 2000; `versionCode` `/^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/`; node `code` `/^[A-Z0-9][A-Z0-9_.-]{0,63}$/`; `weight` > 0 and ≤ 99.9999 with ≤ 4 decimals; threshold percent > 0 and ≤ 100 with ≤ 1 decimal, optional; `minCoverage` integer 0–10000; `displayOrder` integer 0–1 000 000. Error texts in Arabic.
- `messages.ts` gains Arabic entries for: `FORBIDDEN`, `EXAM_NOT_FOUND`, `EXAM_IDENTIFIER_TAKEN`, `INVALID_EXAM_TRANSITION`, `EXAM_HAS_NO_PUBLISHED_TAXONOMY`, `TAXONOMY_VERSION_NOT_FOUND`, `TAXONOMY_VERSION_CODE_TAKEN`, `TAXONOMY_VERSION_NOT_DRAFT`, `TAXONOMY_NODE_NOT_FOUND`, `TAXONOMY_CODE_TAKEN`, `PREREQUISITE_CYCLE`, `PREREQUISITE_OUTSIDE_VERSION`, `TAXONOMY_INCOMPLETE`, `TAXONOMY_PUBLISH_CONFLICT`.

- [ ] **Step 1: Write the failing tests** (Review Focus 4):
  - `percentToShare(85.5) === 0.855`, `percentToShare(100) === 1`, `percentToShare(0.1) === 0.001`; `shareToPercent(0.855) === 85.5`.
  - `skillFormSchema` rejects threshold `85.55` and `0`, accepts `85.5`; rejects `weight` `1.23456` and `0`; rejects `code` `"reading"` (lower case).
  - `examCreateSchema` rejects slug `"Verbal Part"`, accepts `"verbal-part"`.
  - `errorMessage(new ApiError(422, "TAXONOMY_VERSION_NOT_DRAFT", "x", null))` returns the Arabic text, not `"x"`; same for `PREREQUISITE_CYCLE`.
- [ ] **Step 2: Run to verify they fail.** Expected: FAIL.
- [ ] **Step 3: Implement.** `percentToShare` must not leak float noise: `Math.round(percent * 10) / 1000`; `shareToPercent`: `Math.round(share * 1000) / 10`.
- [ ] **Step 4: Run to verify they pass.** Expected: PASS.
- [ ] **Step 5: Commit** — message `Add admin form schemas and Arabic messages for catalog errors`.

---

### Task 7: Web — exams screens

**Files:**
- Create: `apps/web/src/app/admin/page.tsx` (redirect to `/admin/exams`)
- Create: `apps/web/src/app/admin/exams/page.tsx`
- Create: `apps/web/src/app/admin/exams/[examId]/page.tsx`
- Create: `apps/web/src/components/admin/exam-form.tsx` (create and edit)
- Create: `apps/web/src/components/admin/status-badge.tsx` (exam, version and node statuses; Arabic label + token colour)
- Create: `apps/web/src/components/admin/confirm-action.tsx` (inline confirm: description, confirm/cancel buttons, pending state)

**Interfaces:**
- Consumes: Task 4 calls, Task 5 `useRequirePermission(ADMIN_PERMISSIONS.taxonomyManage)`, Task 6 schemas and `errorMessage`, existing `PageHeading`, `Loading`, `ErrorNotice`, `EmptyState`, `TextField`.
- Produces: `StatusBadge({ status }: { status: ExamStatus | VersionStatus | NodeStatus })`, `ConfirmAction({ label, description, onConfirm, pending })` for Task 8.

- [ ] **Step 1: Implement `/admin/exams`**: query `["admin-exams", me.user.id]`; list with code, Arabic name, `StatusBadge`, link to the exam; create form (`ExamForm`) that on success invalidates the list and navigates to the new exam; empty state when there are no exams; no-permission state when `!allowed`.
- [ ] **Step 2: Implement `/admin/exams/[examId]`** (`useParams`): exam details and edit form; status actions — DRAFT shows "تفعيل" and "أرشفة", ACTIVE shows "أرشفة", ARCHIVED none — each through `ConfirmAction`, sending `updateExam(id, { status })` and showing the API error (e.g. `EXAM_HAS_NO_PUBLISHED_TAXONOMY`) on refusal; versions list (`["admin-versions", userId, examId]`) with status and link to the tree; "new draft version" form (version code, optional date) that navigates to the new version.
- [ ] **Step 3: Verify** — `pnpm --filter @qup/web typecheck && pnpm check`. Expected: PASS.
- [ ] **Step 4: Commit** — message `Add admin screens for exams and their taxonomy versions`.

---

### Task 8: Web — taxonomy tree screen

**Files:**
- Create: `apps/web/src/app/admin/taxonomy-versions/[versionId]/page.tsx`
- Create: `apps/web/src/components/admin/taxonomy-tree.tsx` (nested lists, collapse buttons, read-only rendering)
- Create: `apps/web/src/components/admin/node-form.tsx` (domain / skill / subskill create & edit)
- Create: `apps/web/src/components/admin/prerequisite-panel.tsx`
- Create: `apps/web/src/lib/taxonomy-view.ts` (pure helpers)
- Modify: `apps/web/src/app/globals.css` (tree rows; long names wrap — Review Focus 5)
- Test: `apps/web/test/taxonomy-view.test.ts`

**Interfaces:**
- Consumes: Tasks 4–7.
- Produces in `taxonomy-view.ts`: `skillNames(tree: TaxonomyTree): Map<string, string>` (skill id → name, every status); `prerequisiteCandidates(tree: TaxonomyTree, skillId: string): SkillNode[]` (ACTIVE skills of the version, excluding the skill itself and its current prerequisites, ordered by domain then `displayOrder`) — a display filter only; cycles are still decided by the API.

- [ ] **Step 1: Write the failing tests** for `skillNames` and `prerequisiteCandidates` (excludes self, excludes archived, excludes existing links, keeps order).
- [ ] **Step 2: Run to verify they fail**, then **implement** `taxonomy-view.ts`; run again. Expected: PASS.
- [ ] **Step 3: Implement the page**: query `["admin-tree", userId, versionId]`; header with exam/version code and `StatusBadge`; DRAFT → editing controls and "نشر النسخة" via `ConfirmAction` whose description states that publishing archives the currently published version; not DRAFT → read-only notice. Every mutation: submit disabled while pending (Review Focus 1); on success and on `TAXONOMY_VERSION_NOT_DRAFT` invalidate the tree query (Review Focus 2); errors via `errorMessage`.
- [ ] **Step 4: Implement `TaxonomyTree`**: `<ul>`/`<li>` per level; each node row shows code, name, weight, `StatusBadge`; skills add threshold (`shareToPercent` + "٪", or "الافتراضي" when null), priority weight, minimum coverage and prerequisite names via `skillNames`; collapse toggles are `<button aria-expanded>`; inline panels open under the node for add / edit / archive / prerequisites.
- [ ] **Step 5: Implement `NodeForm`** (one component, `kind: NodeType`, `mode: "create" | "edit"`; edit hides `code`) and `PrerequisitePanel` (current links with "إزالة", add from `prerequisiteCandidates` with optional importance weight).
- [ ] **Step 6: Verify** — `pnpm --filter @qup/web test && pnpm --filter @qup/web typecheck && pnpm check`. Expected: PASS.
- [ ] **Step 7: Commit** — message `Add the admin taxonomy tree screen`.

---

### Task 9: Docs, gates, browser verification and security review

**Files:**
- Modify: `apps/web/README.md` (screens table, admin rules, remove "the admin panel" from "Not built yet")
- Modify: `IMPLEMENTATION_STATUS.md` (A1 section, date 2026-10-20)
- Modify: `OPEN_QUESTIONS.md` (new item after #16d: starting a new taxonomy version from the published one — needed before the first production taxonomy update)
- Create: `.claude/launch.json` entries for `api` (`pnpm --filter @qup/api dev`, port 3000) and `web` (`pnpm --filter @qup/web dev`, port 3001) if absent

- [ ] **Step 1: Update the three docs** as listed.
- [ ] **Step 2: All gates** — `pnpm typecheck && pnpm check && pnpm test && pnpm build`. Expected: all PASS.
- [ ] **Step 3: Local admin** — `pnpm --filter @qup/api build && pnpm admin:create --email admin@qup.test` with a generated password recorded only in the git-ignored `.env` as `LOCAL_ADMIN_EMAIL` / `LOCAL_ADMIN_PASSWORD`; also register a plain student account the same way through `/register`.
- [ ] **Step 4: Browser pass** (API + web via the preview tool, local database): as admin, the full Goal flow — create exam → draft version → domain, two skills, a subskill → edit a domain → add then remove a prerequisite → try a cycle and see `PREREQUISITE_CYCLE` in Arabic → publish → activate the exam. Repeat key views at 390 px and 320 px (no horizontal scroll, 120-character name wraps), and a keyboard-only pass of the tree. As the student: no admin link; `/admin/exams` shows the no-permission state and fires no `/admin` requests (network panel).
- [ ] **Step 5: Security review** against AGENTS.md §12 for this diff: authorization only server-side (all new routes under `taxonomy.manage`), mass assignment (strict DTOs, `code` immutable), no answer keys or secrets in the bundle, error text never raw. Note findings in the final report.
- [ ] **Step 6: Commit** — message `Document the admin taxonomy panel`; report changed files, test results, browser findings and risks.
