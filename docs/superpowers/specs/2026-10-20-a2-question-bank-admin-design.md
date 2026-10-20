# A2 — Question bank admin screens (design)

Status: written 2026-10-20 under the user's standing instruction to proceed through the roadmap
without per-step approval. Phase 1 of IMPLEMENTATION_PLAN.md ("manual question editor", "reviews");
follows A1 (`2026-10-20-a1-admin-taxonomy-design.md`) on branch `ahmeddev`.

## Goal

From the web app:

- **Content managers and admins** (`questions.create`) list and filter the question bank, create a
  question, edit a DRAFT version (type, stem, options and answer key, explanation, difficulty,
  taxonomy version, skill mappings, source), submit it for review, and start the next version of a
  published question.
- **Reviewers** (`questions.review`: content managers and admins) approve a version under review,
  or send it back with notes (changes requested / rejected).
- **Admins** (`questions.publish`) publish an approved version and archive a question.

Every rule stays in the API (lifecycle, answer-key and mapping rules, permissions); the screens
submit and show its answers in Arabic.

## Acceptance criteria

- A content manager reaches the admin panel, sees "بنك الأسئلة" and not "الاختبارات والتصنيف",
  and can take a question from nothing to UNDER_REVIEW, choosing the exam's taxonomy and mapping
  skills — without holding `taxonomy.manage`.
- A reviewer can approve or send back with notes; the notes appear in the version's history.
- Only an admin sees publish and archive; the API refuses them for anyone else.
- Content problems on submit/publish (`QUESTION_CONTENT_INVALID`) are listed in Arabic, one line per
  problem, never the API's English text.
- A non-DRAFT version is shown read-only; "new version" starts the next DRAFT.
- Students never reach these screens; no answer key reaches a student route (unchanged).
- No database migration.

## 1. API additions (no migration)

### 1.1 Authoring context — `questions.create`

Content managers must choose an exam's taxonomy and map skills, but the catalog's admin routes
require `taxonomy.manage` (admins only, OPEN_QUESTIONS.md #16a), and the permission guard requires
*every* listed permission. So the questions module gets two read-only routes, reading the catalog
through its public contract (`catalog.contract.ts`), never its tables:

```text
GET /admin/question-authoring/taxonomies
GET /admin/question-authoring/taxonomy-versions/:id/outline
```

- `taxonomies` → `{ items: [{ exam: { id, code, nameAr, status }, versions: [{ id, versionCode,
  status }] }] }`: exams that are not ARCHIVED, each with its versions that are not ARCHIVED, newest
  first. Exams ordered by code.
- `outline` → `{ version: { id, examId, versionCode, status }, domains: [{ id, code, name, skills:
  [{ id, code, name, subskills: [{ id, code, name }] }] }] }`: ACTIVE nodes only (a mapping must
  point at an active node), in display order. Unknown version: `404 TAXONOMY_VERSION_NOT_FOUND`.
- Catalog contract gains `authoringTaxonomies()` and `activeOutline(taxonomyVersionId)`.

### 1.2 Stable rule codes on content problems

`QUESTION_CONTENT_INVALID.details` items gain `rule` (additive; `message` stays for developers):

| rule | When |
| --- | --- |
| `OPTION_COUNT` | wrong number of options for the type (2–6; TRUE_FALSE exactly 2) |
| `CORRECT_ANSWER_COUNT` | not exactly one correct (single / true-false), or none (multiple) |
| `PRIMARY_MAPPING_COUNT` | not exactly one PRIMARY mapping |
| `DUPLICATE_OPTION_KEY` | two options share a key |
| `DUPLICATE_MAPPING` | a skill or subskill mapped twice |
| `MAPPING_OUTSIDE_VERSION` | a mapping is not an active node of the question's taxonomy version |
| `TAXONOMY_VERSION_MISSING` | the taxonomy version does not exist |
| `DATABASE_RULE` | a database check fired (backstop) |

`content-rules.ts` returns `{ rule, message }` problems instead of strings; tests updated.

### 1.3 Stem preview in the list

`GET /admin/questions` items gain `latestVersion.stemPreview`: the stem's text blocks joined by a
space, math blocks as `[…]`, cut to 140 characters with "…". Computed by a pure function
(`stemPreview`) in the questions domain; the list query selects the stem.

## 2. Web app

### 2.1 Access and navigation

- `ADMIN_PERMISSIONS` gains `questionsCreate`, `questionsReview`, `questionsPublish`;
  `hasAdminAccess` therefore opens the panel to content managers.
- Admin nav gains "بنك الأسئلة" (`/admin/questions`, `questions.create`); "الاختبارات والتصنيف"
  stays `taxonomy.manage` only. `/admin` sends each account to the first screen it may use.
- Pages use `AdminGate` with `questions.create`; review and publish controls show only with their
  own permission (the API refuses regardless).

### 2.2 Screens

| Route | Content |
| --- | --- |
| `/admin/questions` | Filters (status, exam → taxonomy version), paginated list: code, stem preview, type, version number, status, updated date; "سؤال جديد". |
| `/admin/questions/new` | The editor in create mode; saving creates the question and opens its first version. |
| `/admin/questions/[questionId]` | Code, archived state, versions (newest first) with status; "new version" (when none is in progress), "archive" (publish permission). |
| `/admin/question-versions/[versionId]` | The version rendered as a student would see it (plus answer key, explanation, mappings, source), its review history, and the actions its status allows: DRAFT → edit, submit; UNDER_REVIEW → review (approve / changes requested / reject + notes); APPROVED → publish. |

### 2.3 Editor

- One form (React Hook Form + Zod, `useFieldArray`): question type; stem and explanation as block
  lists (text / math, add, remove, move); options (key, content, correct); difficulty; exam and
  taxonomy version (from §1.1); mappings (skill or subskill from the outline, role, optional
  weight, optional rationale); source type and reference.
- Difficulty is chosen from the authoring presets of ADAPTIVE_ENGINE.md §4 (سهل 0.25، متوسط 0.5،
  صعب 0.75، متقدم 0.9), kept in one named constant with that reference; a stored value that is not
  a preset is shown as "مخصص" and kept.
- Option keys default to A, B, C… and stay editable. Correct answers are checkboxes for every
  type — "exactly one" is the API's rule, reported by `CORRECT_ANSWER_COUNT`.
- The form converts to the API's content body in one pure function (`toDraftContentInput`).
- Saving an unfinished draft is allowed (the API allows it); submitting shows the API's problems.
- Math blocks are typed as LaTeX and previewed as their source (rendering is not built yet).

### 2.4 Messages

Arabic for: `QUESTION_NOT_FOUND`, `QUESTION_VERSION_NOT_FOUND`, `QUESTION_CODE_TAKEN`,
`INVALID_QUESTION_TRANSITION`, `QUESTION_VERSION_CHANGED`, `QUESTION_VERSION_IN_PROGRESS`,
`QUESTION_ARCHIVED`, `QUESTION_CONTENT_INVALID`, `TAXONOMY_NOT_PUBLISHED`, and every `rule` in
§1.2. `QUESTION_CONTENT_INVALID` shows its details as a list.

## 3. Testing and verification

- **API e2e**: authoring routes (content manager allowed, student 403, archived exams/versions
  excluded, outline active-only, 404); rule codes on submit and publish; `stemPreview` in the list.
- **API unit**: `stemPreview`; `content-rules` returning rule codes (existing tests updated).
- **Web unit**: client calls; permissions and nav for a content manager; `toDraftContentInput`;
  editor schema; rule-code messages.
- **Gates**: typecheck, Biome, all suites, build.
- **Browser**: as a content manager, create → edit → submit; as admin, review → publish → new
  version; read-only states; 390 px and 320 px; keyboard pass of the editor.

## 4. Documentation

API_CONTRACTS.md (§1), apps/web/README.md, IMPLEMENTATION_STATUS.md, OPEN_QUESTIONS.md (below).

## 5. Assumptions recorded in OPEN_QUESTIONS.md

- Content managers may *read* the active taxonomy outline of any non-archived exam to map
  questions — implied by #14 (they author questions) and consistent with #16a (only admins
  *manage* the taxonomy).
- Difficulty presets are ADAPTIVE_ENGINE.md §4's authoring defaults; calibrated difficulty stays a
  separate, later value.

## 6. Out of scope

Images in content (object storage), math rendering, bulk import (A3), full-text search, deleting
questions (archive only, PRD), editing a non-DRAFT version (by design).
