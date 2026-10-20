# A2 — Question Bank Admin Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Content managers and admins author, review, publish and version questions from the web app.

**Architecture:** Three additive API changes in `questions` (+ two read methods on the catalog contract): rule codes on content problems, a stem preview in the list, and a read-only authoring context under `questions.create`. In the web app, three admin routes on top of A1's shell and `AdminGate`, a question editor built from small field components, and all conversion and message logic in `src/lib/` with Vitest tests.

**Tech Stack:** as A1 (NestJS + Fastify, Drizzle, PostgreSQL 16, Zod 4, Vitest; Next.js 16, React, TanStack Query, React Hook Form `useFieldArray`, Biome, pnpm 10).

**Spec:** `docs/superpowers/specs/2026-10-20-a2-question-bank-admin-design.md`

## Global Constraints

- No migration; existing routes keep their shapes except the additive fields named in the spec.
- New API routes sit under `@RequirePermissions(Permission.QuestionsCreate)`; review stays `questions.review`, publish/archive `questions.publish`.
- The questions module reads the taxonomy only through `CATALOG_LOOKUP` (catalog.contract.ts).
- Web: no business rule in the browser (answer-key counts, mapping counts, lifecycle are the API's); every account-bound query key includes the user id; errors in Arabic via `errorMessage()`; content rendered as text, never HTML.
- Web: RTL, keyboard reachable, labelled inputs, no horizontal scroll at 320 px, tokens from DESIGN.md.
- Tests against the local `qup_db`, never CranL. Commits on `ahmeddev`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; no push.

## Review Focus

1. **Switching the taxonomy version on a draft with mappings**: the old mappings point at another version's nodes; the editor clears them with a visible note instead of sending them (Task 7).
2. **Changing question type to TRUE_FALSE with four options**: nothing is silently dropped; the API's `OPTION_COUNT` problem is shown on submit (Task 6 messages, Task 9).
3. **Review sent back without notes**: the form requires notes for "changes requested" / "rejected" before sending (mirrors the API's rule; the API refuses anyway) (Task 9).
4. **Two people acting on one version** (one submits while another edits): `QUESTION_VERSION_CHANGED` / `INVALID_QUESTION_TRANSITION` show in Arabic and the version refetches (Task 9).
5. **Long stems and many options at 320 px**: text wraps, block controls stay reachable (Task 7 CSS, Task 10 browser).

---

### Task 0: Disk space and baseline

- [ ] **Step 1:** Free space ≥ 2 GB (`df -h /System/Volumes/Data`); stop if not.
- [ ] **Step 2:** `pnpm typecheck && pnpm check && pnpm test` → all pass (A1 baseline: 464 tests). Stop and report any failure.

### Task 1: API — rule codes on content problems

**Files:** `apps/api/src/modules/questions/domain/content-rules.ts`, `apps/api/src/modules/questions/application/questions.service.ts`, `apps/api/src/modules/questions/infrastructure/drizzle-question-store.ts` (`translate`), `apps/api/src/common/validation/zod-validation.pipe.ts` (`ValidationIssue.rule?: string`), `API_CONTRACTS.md`; tests `apps/api/test/questions/questions-domain.test.ts`, `apps/api/test/questions/questions.e2e.test.ts`.

**Interfaces — Produces:** `type ContentRule = "OPTION_COUNT" | "CORRECT_ANSWER_COUNT" | "PRIMARY_MAPPING_COUNT" | "DUPLICATE_OPTION_KEY" | "DUPLICATE_MAPPING" | "MAPPING_OUTSIDE_VERSION" | "TAXONOMY_VERSION_MISSING" | "DATABASE_RULE"`; `interface ContentProblem { rule: ContentRule; message: string }`; `answerKeyProblems`, `mappingProblems`, `publishabilityProblems`, `structuralProblems` return `ContentProblem[]`; `QUESTION_CONTENT_INVALID.details[]` = `{ path, message, rule }`.

- [ ] **Step 1: Update the domain tests** to assert rules: `answerKeyProblems("SINGLE_CHOICE", options(true, true, false)).map(p => p.rule)` equals `["CORRECT_ANSWER_COUNT"]`; `answerKeyProblems("TRUE_FALSE", options(true, false, false))` contains `OPTION_COUNT`; `mappingProblems([mapping("SECONDARY","a")])` → `["PRIMARY_MAPPING_COUNT"]`; the duplicate test → rules `["DUPLICATE_OPTION_KEY", "DUPLICATE_MAPPING"]`. Add e2e `it("names the broken rules when a draft is submitted")`: draft with two options, none correct, no mapping → submit → `422`, `details.map(d => d.rule)` contains `CORRECT_ANSWER_COUNT` and `PRIMARY_MAPPING_COUNT`; and `it("names a mapping outside the version")` → `MAPPING_OUTSIDE_VERSION` on create.
- [ ] **Step 2:** Run both files → FAIL.
- [ ] **Step 3:** Implement; messages unchanged.
- [ ] **Step 4:** Run → PASS; then `pnpm --filter @qup/api test`.
- [ ] **Step 5:** Document the rule table in API_CONTRACTS.md "Questions"; commit `Name the broken rule in question content problems`.

### Task 2: API — stem preview in the question list

**Files:** create `apps/api/src/modules/questions/domain/stem-preview.ts`; modify `domain/ports.ts` (`QuestionListItem.latestVersion` gains `stemPreview: string`), `infrastructure/drizzle-question-store.ts` (list selects `stemContent`), `presentation/questions.views.ts`, `API_CONTRACTS.md`; tests `apps/api/test/questions/stem-preview.test.ts`, `questions.e2e.test.ts`.

**Interfaces — Produces:** `stemPreview(stem: RichContent, maxLength = STEM_PREVIEW_LENGTH): string` with `STEM_PREVIEW_LENGTH = 140`.

- [ ] **Step 1: Tests:** text blocks joined by one space; math block → `[…]`; whitespace collapsed; > 140 chars → first 139 + `…` (length 140); empty stem → `""`. E2E: the list item has `latestVersion.stemPreview` equal to the created stem's text.
- [ ] **Step 2:** FAIL → **Step 3:** implement (version summaries elsewhere keep their shape; only list items carry the preview) → **Step 4:** PASS + API suite.
- [ ] **Step 5:** Document; commit `Show a stem preview in the question list`.

### Task 3: API — authoring context for question authors

**Files:** `apps/api/src/modules/catalog/catalog.contract.ts`, `catalog/infrastructure/drizzle-catalog-lookup.ts`; create `apps/api/src/modules/questions/presentation/question-authoring.controller.ts` (register in `questions.module.ts`); `API_CONTRACTS.md`; test `apps/api/test/questions/question-authoring.e2e.test.ts`.

**Interfaces — Produces:** contract `authoringTaxonomies(): Promise<AuthoringExam[]>` where `AuthoringExam = { exam: { id; code; nameAr; status }; versions: { id; versionCode; status }[] }` (exams ≠ ARCHIVED by code; versions ≠ ARCHIVED, newest first); `activeOutline(versionId): Promise<TaxonomyOutline | null>` where `TaxonomyOutline = { version: { id; examId; versionCode; status }; domains: { id; code; name; skills: { id; code; name; subskills: { id; code; name }[] }[] }[] }` (ACTIVE nodes, display order; four queries, no N+1). Routes `GET /admin/question-authoring/taxonomies` → `{ items }`, `GET /admin/question-authoring/taxonomy-versions/:id/outline` (404 `TAXONOMY_VERSION_NOT_FOUND`).

- [ ] **Step 1: E2E tests:** content manager `200` on both; student `403`; an ARCHIVED exam and an ARCHIVED version are absent; the outline omits an archived skill; unknown version `404`.
- [ ] **Step 2:** FAIL → **Step 3:** implement (the 404 is a questions-module error reusing the code `TAXONOMY_VERSION_NOT_FOUND`) → **Step 4:** PASS + API suite.
- [ ] **Step 5:** Document; commit `Let question authors read the taxonomy they map to`.

### Task 4: Web — question admin client

**Files:** create `apps/web/src/lib/question-api.ts`; test `apps/web/test/question-client.test.ts`.

**Interfaces — Produces:** types `QuestionType`, `QuestionVersionStatus`, `ContentBlock`/`RichContent` (re-exported from api.ts), `QuestionOption`, `QuestionMapping`, `QuestionVersion` (detail incl. `reviews`), `QuestionSummary`, `QuestionListItem`, `DraftContentInput`, `ContentProblem { path; message; rule? }`, `AuthoringExam`, `TaxonomyOutline`; calls `listQuestions(filters)`, `createQuestion(body)`, `getQuestion(id)`, `createNextVersion(questionId)`, `archiveQuestion(id)`, `getQuestionVersion(id)`, `updateDraft(id, content)` (PUT — add `"PUT"` to `RequestOptions.method`), `submitForReview(id)`, `reviewVersion(id, { decision, notes? })`, `publishVersion(id)`, `listAuthoringTaxonomies()`, `getTaxonomyOutline(versionId)`.

- [ ] **Step 1: Tests:** `listQuestions({ limit: 20, offset: 40, status: "DRAFT" })` → `/api/v1/admin/questions?limit=20&offset=40&status=DRAFT`; `updateDraft` uses `PUT` with the JSON body; `reviewVersion` posts `{ decision: "CHANGES_REQUESTED", notes }`; a `QUESTION_CONTENT_INVALID` response keeps `details` on the `ApiError`.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS + typecheck → **Step 5:** commit `Add the question admin client`.

### Task 5: Web — question permissions and navigation

**Files:** `apps/web/src/lib/permissions.ts`, `apps/web/src/app/admin/page.tsx` (client: replace to `firstAdminScreen(me)`, no-permission state if none); tests `apps/web/test/permissions.test.ts`.

**Interfaces — Produces:** `ADMIN_PERMISSIONS` adds `questionsCreate: "questions.create"`, `questionsReview: "questions.review"`, `questionsPublish: "questions.publish"`; nav item `{ href: "/admin/questions", title: "بنك الأسئلة", icon: "grid" }` (questions.create); `firstAdminScreen(me): string | null`.

- [ ] **Step 1: Tests (update A1's):** content manager → `hasAdminAccess` true, nav hrefs `["/admin/questions"]`, `firstAdminScreen` `"/admin/questions"`; admin → `["/admin/exams", "/admin/questions"]`; student → `[]`, `null`.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS → **Step 5:** commit `Open the admin panel to question authors`.

### Task 6: Web — question form model and messages

**Files:** create `apps/web/src/lib/question-form.ts`; modify `apps/web/src/lib/messages.ts`; test `apps/web/test/question-form.test.ts`.

**Interfaces — Produces:** `DIFFICULTY_PRESETS` (`[{ value: 0.25, label: "سهل" }, { value: 0.5, label: "متوسط" }, { value: 0.75, label: "صعب" }, { value: 0.9, label: "متقدم" }]`, ADAPTIVE_ENGINE.md §4); `questionFormSchema` (Zod; limits from questions.dto.ts: ≤ 50 blocks, text ≤ 5000, LaTeX ≤ 2000, ≤ 6 options, keys `^[A-Z0-9]{1,8}$`, ≤ 10 mappings, rationale ≤ 1000, source type ≤ 100, reference ≤ 500); `QuestionForm` type; `emptyQuestionForm()`; `formFromVersion(version: QuestionVersion): QuestionForm`; `toDraftContentInput(form): DraftContentInput` (drops empty blocks, empty explanation → omitted, mapping target `{ kind: "skill" | "subskill", id }` → `skillId`/`subskillId`, blank weight → omitted, option `displayOrder` = index); `optionKey(index): string` ("A"…); `contentProblemMessages(error: unknown): string[]` (Arabic per `rule`, generic line for unknown rules, `[]` otherwise). `messages.ts` gains the question codes listed in the spec.

- [ ] **Step 1: Tests:** round trip `toDraftContentInput(formFromVersion(v))` equals v's content; empty text blocks dropped; an all-empty explanation omitted; subskill target maps to `subskillId` only; `optionKey(0) === "A"`, `optionKey(5) === "F"`; `contentProblemMessages` for `[{rule:"CORRECT_ANSWER_COUNT"},{rule:"PRIMARY_MAPPING_COUNT"}]` → two Arabic lines; unknown rule → one generic Arabic line; schema rejects key `"a"` and 7 options.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS → **Step 5:** commit `Add the question form model and Arabic messages`.

### Task 7: Web — question editor

**Files:** create `apps/web/src/components/admin/question-editor/` — `question-editor.tsx` (form shell: create → `createQuestion`, edit → `updateDraft`; single-flight; refetch on `QUESTION_VERSION_CHANGED`), `blocks-field.tsx` (text/math blocks: add, remove, move up/down), `options-field.tsx`, `mappings-field.tsx` (skill/subskill select from the outline, role, weight, rationale), `taxonomy-picker.tsx` (exam → version from `listAuthoringTaxonomies`; changing the version clears mappings with a `role="status"` note — Review Focus 1); page `apps/web/src/app/admin/questions/new/page.tsx`; CSS in `globals.css`.

- [ ] **Step 1:** Implement the field components and the editor against Task 6's model; the "add block/option/mapping" buttons respect the schema limits by disabling at the maximum (display only).
- [ ] **Step 2:** `/admin/questions/new`: `AdminGate(questions.create)`; on create, navigate to `/admin/question-versions/:id`.
- [ ] **Step 3:** `pnpm --filter @qup/web typecheck && pnpm check` → PASS; commit `Add the question editor`.

### Task 8: Web — question list and question page

**Files:** `apps/web/src/app/admin/questions/page.tsx`, `apps/web/src/app/admin/questions/[questionId]/page.tsx`; extend `components/admin/status-badge.tsx` with `UNDER_REVIEW` ("قيد المراجعة") and `APPROVED` ("معتمد").

- [ ] **Step 1:** List: filters (status select; exam → version from authoring context), page size 20 with previous/next using `page.total`, rows linking to the newest version, empty and error states, "سؤال جديد".
- [ ] **Step 2:** Question page: code, archived badge, versions (newest first) linking to each version, "إنشاء نسخة جديدة" (`createNextVersion`, shows `QUESTION_VERSION_IN_PROGRESS` in Arabic), "أرشفة السؤال" via `ConfirmAction` (publish permission only).
- [ ] **Step 3:** typecheck + Biome → PASS; commit `Add the question list and question pages`.

### Task 9: Web — version page and workflow

**Files:** `apps/web/src/app/admin/question-versions/[versionId]/page.tsx`; create `components/admin/question-preview.tsx` (stem, options with correct marks, explanation, mappings by name via the outline, source), `components/admin/review-panel.tsx`.

- [ ] **Step 1:** Version page: header (code, version number, status), preview, review history (decision, notes, date), and by status: DRAFT → editor (Task 7) + "إرسال للمراجعة" (problems listed via `contentProblemMessages`); UNDER_REVIEW → `ReviewPanel` (questions.review): approve, or changes requested / rejected with required notes (Review Focus 3); APPROVED → "نشر" via `ConfirmAction` (questions.publish; `TAXONOMY_NOT_PUBLISHED` explained); PUBLISHED/ARCHIVED → read-only with a link to the question page.
- [ ] **Step 2:** Every action single-flight; on `QUESTION_VERSION_CHANGED` or `INVALID_QUESTION_TRANSITION` refetch the version (Review Focus 4).
- [ ] **Step 3:** typecheck + Biome + web tests → PASS; commit `Add the question version page and its workflow`.

### Task 10: Docs, gates, browser pass, security review

- [ ] **Step 1:** apps/web/README.md (screens + rules), IMPLEMENTATION_STATUS.md (A2), OPEN_QUESTIONS.md (the two assumptions in the spec §5).
- [ ] **Step 2:** `pnpm typecheck && pnpm check && pnpm test && pnpm build` → PASS.
- [ ] **Step 3:** Local content manager: register `manager@qup.test` (generated password in `.env` as `LOCAL_MANAGER_*`), then `psql -d qup_db` to grant `CONTENT_MANAGER`.
- [ ] **Step 4:** Browser: as manager — no taxonomy item, create a question on QUDURAT's published version, map ANALOGY as PRIMARY, submit with no correct answer (Arabic problems), fix, submit; as admin — review (send back with notes, then approve), publish, new version; 390/320 px; keyboard pass of the editor.
- [ ] **Step 5:** Security review (§12): new routes' permissions, answer keys only on admin routes, no HTML rendering, strict DTOs.
- [ ] **Step 6:** Commit `Document the question bank admin screens`; final self-review; report.
