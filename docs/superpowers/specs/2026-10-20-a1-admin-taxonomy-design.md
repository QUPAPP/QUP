# A1 — Admin panel and taxonomy tree (design)

Status: approved in conversation on 2026-10-20. Phase 1 of IMPLEMENTATION_PLAN.md
("admin taxonomy tree"); first slice of the roadmap A1 → A2 → C1 → B1 → … .

## Goal

A user holding `taxonomy.manage` (today: ADMIN only, OPEN_QUESTIONS.md #16a) can, from the web app:

1. create an exam and edit its names and description;
2. open a DRAFT taxonomy version for it;
3. build the tree — domains → skills → subskills — with weights, mastery thresholds, priority,
   minimum coverage, display order and skill prerequisites;
4. edit and archive nodes, add and remove prerequisites, while the version is DRAFT;
5. publish the version, then activate (or archive) the exam.

Students and content managers never see these screens. The API remains the only authority: every
route is already guarded by `taxonomy.manage` server-side; the interface only hides what the
caller cannot use.

## Acceptance criteria

- An ADMIN can complete steps 1–5 above entirely in the browser, on desktop and phone widths.
- A student or content manager who opens any `/admin/*` URL sees a "no permission" state and no
  admin data; the student workspace shows no admin link to them.
- A visitor without a session is sent to `/login`.
- A published or archived version is shown read-only, with no edit controls.
- Every API rejection is shown in Arabic from its stable error code, never as raw server text.
- No business rule is computed in the browser (e.g. whether a version may be published, whether
  prerequisites form a cycle): the interface submits and displays the API's answer.
- No database migration. Existing tests stay green; new tests cover what is added.

## 1. API additions

No schema change: migration `0005_taxonomy_guards` already freezes non-DRAFT versions for
INSERT, UPDATE and DELETE on domains, skills, subskills and skill prerequisites. All routes below
sit in the existing controllers, so the class-level `taxonomy.manage` requirement covers them.

### 1.1 `GET /admin/exams/:id/taxonomy-versions`

The exam's taxonomy versions, newest first (`createdAt` desc, then `id`), in every status.

```json
{ "items": [ { "id": "…", "examId": "…", "versionCode": "2026.1", "status": "DRAFT",
               "effectiveFrom": null, "createdAt": "…" } ] }
```

- `404 EXAM_NOT_FOUND` when the exam does not exist.
- No pagination: an exam has a handful of versions over its life, the same reasoning
  `GET /admin/exams` already documents.

Why: there is no way today to find a version after creating it — the web app could not list an
exam's drafts.

### 1.2 `PATCH /admin/domains/:id` and `PATCH /admin/subskills/:id`

Mirror `PATCH /admin/skills/:id`: strict body, at least one field, `204`.

| Route | Editable fields |
| --- | --- |
| domains | `name`, `description` (nullable), `weight`, `displayOrder` |
| subskills | `name`, `description` (nullable), `weight`, `masteryThreshold` (nullable), `displayOrder` |

- Same field rules as creation (`weight` 4 decimals in `(0, 99.9999]`, threshold 3 decimals in
  `(0, 1]`, `displayOrder` integer ≥ 0). `code` is not editable: questions and imports refer to it.
- `404 TAXONOMY_NODE_NOT_FOUND`; `422 TAXONOMY_VERSION_NOT_DRAFT` outside DRAFT.

Why: only skills can be edited today; a typo in a domain or subskill name would need archiving
the node, and its code would stay taken in that version.

### 1.3 `DELETE /admin/skills/:id/prerequisites/:prerequisiteSkillId`

Removes the prerequisite link, `204`.

- Idempotent: removing a link that does not exist is also `204` (the requested state holds).
- `404 TAXONOMY_NODE_NOT_FOUND` when the skill does not exist; `422 TAXONOMY_VERSION_NOT_DRAFT`
  outside DRAFT.
- Nothing historical is lost: links in a DRAFT version have never been used by an assessment.

Why: a prerequisite added by mistake could not be undone.

### API layering

Each addition follows the module's existing path: Zod DTO (strict) → controller →
`TaxonomyService`/`ExamsService` (`requireDraft` where it applies) → `CatalogStore` port →
Drizzle adapter. Errors are the module's existing typed errors; no new error codes.

## 2. Web app

### 2.1 Access

- `GET /auth/me` already returns `{ user, roles, permissions }`; the client type and the cached
  "me" query are extended to keep `permissions`.
- `src/lib/permissions.ts`: `hasPermission(me, code)` and `hasAdminAccess(me)` (any permission the
  admin panel uses). Permission codes are contract identifiers shared with the API, not rules.
- `useRequirePermission(code)`: no session → `/login`; session without the permission → the page
  renders a "ليس لديك صلاحية" state and fires no admin queries.
- Query keys for admin data include the current user id, like every other account-bound key.

### 2.2 Shell and navigation

- `AdminShell`: its own sidebar titled "لوحة الإدارة" with the items the caller may use — in A1
  only "الاختبارات والتصنيف" (`taxonomy.manage`) — and a link back to the student workspace.
  Same tokens and components as `AppShell`; mobile navigation included.
- `AppShell` shows a "لوحة الإدارة" link only when `hasAdminAccess(me)`.
- The root layout picks `AdminShell` for `/admin/*`.

### 2.3 Screens

| Route | Content |
| --- | --- |
| `/admin` | Redirects to `/admin/exams`. |
| `/admin/exams` | All exams with status badge; create form (code, slug, Arabic name, English name, description); links to each exam. |
| `/admin/exams/[examId]` | Exam details with edit form; status actions (activate, archive) behind a confirmation; versions list from §1.1; "new draft version" form (version code, optional effective date). |
| `/admin/taxonomy-versions/[versionId]` | The tree (below). |

Tree screen:

- Header: exam name, version code, status badge. DRAFT shows "نشر النسخة" behind a confirmation
  that says publishing archives the exam's currently published version.
- Domains → skills → subskills as nested semantic lists, each node collapsible with a real button
  (`aria-expanded`), showing code, name, weight and status; skills also show threshold (as a
  percentage), priority weight, minimum coverage and prerequisites by skill name.
- DRAFT only: "add domain / skill / subskill", "edit", "archive" (confirmation) and
  "prerequisites" (add from the version's other active skills, remove) — as inline panels under
  the node, not modal dialogs.
- Not DRAFT: read-only, with a note that changes go into a new version.
- After any successful change the tree query is invalidated and refetched; the interface never
  patches the tree locally.

### 2.4 Forms and messages

- React Hook Form + Zod. Client schemas only spare a round trip (required fields, formats, number
  ranges); the API validates again and is the authority.
- Thresholds are entered as a percentage with at most one decimal and sent as a share
  (85.5 → 0.855): presentation only.
- New Arabic messages in `src/lib/messages.ts` for: `FORBIDDEN`, `EXAM_NOT_FOUND`,
  `EXAM_IDENTIFIER_TAKEN`, `INVALID_EXAM_TRANSITION`, `EXAM_HAS_NO_PUBLISHED_TAXONOMY`,
  `TAXONOMY_VERSION_NOT_FOUND`, `TAXONOMY_VERSION_CODE_TAKEN`, `TAXONOMY_VERSION_NOT_DRAFT`,
  `TAXONOMY_NODE_NOT_FOUND`, `TAXONOMY_CODE_TAKEN`, `PREREQUISITE_CYCLE`,
  `PREREQUISITE_OUTSIDE_VERSION`, `TAXONOMY_INCOMPLETE`, `TAXONOMY_PUBLISH_CONFLICT`.
- The API client gains `PATCH` and `DELETE`.

### 2.5 Accessibility and design

RTL-first, keyboard reachable, visible focus, labelled inputs with linked error text, status
conveyed by text and not only colour, 320 px without horizontal scroll. Tokens and components from
`apps/web/DESIGN.md`; no new visual language.

## 3. Testing and verification

- **API e2e** (`apps/api/test/catalog/`), against a local PostgreSQL 16 — never the CranL
  database: for each addition, ADMIN success, content manager and student `403`, unknown id `404`,
  non-DRAFT `422`; list ordering; idempotent prerequisite removal; edit validation (`400`).
- **API unit**: service paths that call `requireDraft`.
- **Web unit** (Vitest): admin API client calls (method, path, body), `hasPermission` /
  `hasAdminAccess`, admin navigation visibility, form schemas including the percentage conversion.
- **Gates**: typecheck, Biome, all test suites, production build.
- **Browser**: API + web + local database; the full flow from §Goal on 1440 px and 390 px, RTL,
  keyboard-only pass, and the no-permission state as a student.

## 4. Documentation

`API_CONTRACTS.md` (§1 routes), `apps/web/README.md` (screens, admin rules),
`IMPLEMENTATION_STATUS.md`, and `OPEN_QUESTIONS.md` (new item below).

## 5. Out of scope

- **Starting a new version from the published one.** A new version starts empty, as today. Any
  change after the first publish would mean re-entering the tree, so copying the published tree
  into a new DRAFT must exist before the first production taxonomy update. Recorded as a new
  OPEN_QUESTIONS.md item together with #16d (what happens to questions mapped to the old version).
- Question screens (A2), imports (A3), user/role management.
- Drag-and-drop ordering: the numeric display order field is used instead.

## 6. Risks

- **Local database for tests.** e2e tests need PostgreSQL 16 locally (installed via Homebrew); a
  local `qup_db` is created for this. If it cannot run, integration tests are reported as not run.
- **Next.js 16 conventions** differ from older versions (apps/web/AGENTS.md); the bundled docs in
  `node_modules/next/dist/docs/` are read before writing routes and layouts.
- **No push.** Work is committed on `ahmeddev`; it cannot reach GitHub until `iksasa15` has write
  access to `QUPAPP/QUP`.
