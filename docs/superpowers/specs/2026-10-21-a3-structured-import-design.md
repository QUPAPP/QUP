# A3 — Structured question import

Date: 2026-10-21. Branch: `ahmeddev`. Executed on the user's request ("كمّل بالشريحة A3"). Rules the
documents leave open are recorded in `OPEN_QUESTIONS.md` #16g.

## Why

The client owns a question bank (PRD §4), and Content Managers handle "imports" (PRD §3). Typing
thousands of questions one by one in the A2 editor is not realistic. `QUESTION_BANK_IMPORT.md`
defines the structured path:

- XLSX/CSV/TSV/JSON;
- a column mapper with auto-suggest;
- preview and row-level validation;
- an import report;
- duplicate detection;
- provenance;
- never publishing automatically.

The import tables already exist (`import_batches`, `import_items`, ERD "Imports"), but nothing uses
them yet.

## Scope

**In scope:** structured files (CSV, TSV, JSON, XLSX first sheet), turned into DRAFT questions that
enter the A2 review workflow.

**Out of scope (later):**
- DOCX/PDF/images and AI-assisted structuring (C3);
- fuzzy and embedding duplicate layers;
- saved mapping templates;
- editing rows in place (fix the file and upload again, or edit the draft afterwards);
- math in cells (cells become text blocks).

## Flow (Content Manager or Admin, permission `questions.create`)

1. **Upload** on `/admin/imports`.
   - The file is sent as `{ filename, contentBase64 }`.
   - Checks: extension and signature (XLSX must be a ZIP; text formats must be valid UTF-8 with no
     NUL bytes; JSON must parse as an array of objects); at most 2 MB, 1000 rows, 50 columns and
     5000 characters per cell.
   - XLSX: at most 200 entries and 20 MB uncompressed (zip-bomb guard). Only
     `xl/sharedStrings.xml` and the first worksheet are read; macros and other parts are ignored.
   - The original file is kept in private storage under a random key (`object_key`).
   - Each row becomes an `import_item` (`PENDING`, `source_locator: "row N"`, raw cells kept in
     `normalized_payload.raw`).
   - The batch is `UPLOADED` with its headers and a suggested mapping.
2. **Map and validate** with `POST /admin/imports/:id/process` and
   `{ taxonomyVersionId, mapping }`:
   - The mapping's fields are `stem`*, `options` (2–6 columns)*, `correctAnswer`*, `skill`*, and
     optionally `subskill`, `questionType`, `explanation`, `difficulty`, `source`.
   - Each row is normalised and validated. The resulting status is one of:
     - `VALID`;
     - `INVALID` with stable codes (see below);
     - `DUPLICATE`, when the stem fingerprint matches a non-archived question of the same exam
       (`duplicate_of_question_id`) or an earlier row of this batch.
   - The batch becomes `READY_FOR_REVIEW` with its totals. Processing can be run again with another
     mapping until drafts are created.
3. **Review** at `/admin/imports/:id`:
   - the report;
   - rows filtered by status, each with its errors;
   - resolve per item: `SKIP` (any but `IMPORTED`), or `INCLUDE` for a `DUPLICATE` the reviewer
     confirms is distinct ("human confirmation for ambiguous matches").
4. **Create drafts** with `POST /admin/imports/:id/create-drafts`:
   - Each `VALID` item becomes a DRAFT question through the questions module's own validation.
   - Provenance: `source_type: "IMPORT"` and `source_reference` (the `source` column, else
     `"<filename> · row N"`). The creator is the importing user, and the item links to the
     resulting version.
   - Each item is claimed (`VALID → IMPORTED`) before its draft is written, so two clicks never
     create two drafts.
   - Rejected items become `INVALID` with code `DRAFT_REJECTED`.
   - The batch ends `COMPLETED`, or `PARTIALLY_FAILED` when any item was rejected.

## Row normalisation

| Field | Accepts | Error code |
| --- | --- | --- |
| stem | non-empty text | `STEM_MISSING` |
| options | non-empty cells of the option columns, keys A…F in column order | `OPTIONS_TOO_FEW` (fewer than 2) |
| correctAnswer | a letter A–F or أ ب ج د هـ و, a number 1–6, or the exact option text; several separated by `,` or `،` | `CORRECT_ANSWER_MISSING`, `CORRECT_ANSWER_UNKNOWN` |
| questionType | `single`/`اختيار من متعدد`, `multiple`/`متعدد الإجابات`, `true_false`/`صح وخطأ`; absent → MULTIPLE when more than one is correct, else SINGLE | `QUESTION_TYPE_UNKNOWN` |
| skill | code (case-insensitive) or name of an active skill of the chosen version | `SKILL_UNKNOWN` |
| subskill | code or name of an active subskill of that skill; the mapping then targets the subskill | `SUBSKILL_UNKNOWN` |
| difficulty | 0–1, or 1–100 as a percentage, or سهل / متوسط / صعب (0.25 / 0.5 / 0.75); absent → 0.5 | `DIFFICULTY_INVALID` |

The content rules then apply as for authoring (`OPTION_COUNT`, `CORRECT_ANSWER_COUNT`, …).

**Fingerprint:**
1. Take the stem's text, NFKC.
2. Remove tashkeel and tatweel.
3. Unify alef forms, ى→ي and ة→ه.
4. Drop punctuation, collapse spaces, lowercase.
5. Hash with sha256.

## API

```text
GET  /admin/imports?limit&offset                 batches, newest first
POST /admin/imports/upload                       { filename, contentBase64 } → 201 batch
GET  /admin/imports/:id                          batch, headers, suggestedMapping, totals
GET  /admin/imports/:id/items?status&limit&offset
POST /admin/imports/:id/process                  { taxonomyVersionId, mapping } → batch
POST /admin/import-items/:id/resolve             { action: "SKIP" | "INCLUDE" } → item
POST /admin/imports/:id/create-drafts            → batch
```

**Errors:**
- `IMPORT_FILE_TYPE_UNSUPPORTED` (422);
- `IMPORT_FILE_INVALID` (422, with the reason);
- `IMPORT_FILE_TOO_LARGE` (413);
- `IMPORT_NOT_FOUND` / `IMPORT_ITEM_NOT_FOUND` (404);
- `IMPORT_MAPPING_INVALID` (422: a column the file lacks, or a required field unmapped);
- `IMPORT_ALREADY_IMPORTED` (409: processing again after drafts were created);
- `IMPORT_ITEM_NOT_RESOLVABLE` (409);
- `TAXONOMY_VERSION_NOT_FOUND` (404 / archived).

The upload route has its own body limit (3 MiB for 2 MB of base64). This is a documented exception
to "uploads go to object storage": there is no object storage yet (OPEN_QUESTIONS.md #16g). The
storage itself sits behind a port; the V1 adapter writes to a private local directory
(`IMPORT_STORAGE_DIR`, default `./var/imports`, git-ignored).

**Totals:** `{ detected, valid, invalid, duplicate, imported, skipped, errors: { CODE: count } }`.

## Architecture

- New module `content-import` (AGENTS.md §5), with:
  - `domain/tabular.ts` (pure CSV/TSV/JSON → table; XLSX via `xlsx-reader.ts` on `fflate` 0.8.2);
  - `domain/row-normaliser.ts` (pure);
  - `domain/fingerprint.ts` (pure);
  - `domain/column-suggestions.ts`;
  - an application service, a Drizzle store, a local file storage adapter and a controller.
- It depends on:
  - catalog (`activeOutline`, `versionStatus`);
  - questions, through a new `QUESTION_AUTHOR` contract (`createDraft(content, actor)` reusing
    `QuestionsService.create`, and `fingerprintsInExam(examId)`).
- It owns the import tables. No migration is needed: `totals`, `normalized_payload` and
  `validation_errors` are JSON already.
- Web:
  - `lib/import-api.ts`, `lib/import-mapping.ts`;
  - `/admin/imports` (list and upload);
  - `/admin/imports/:id` (mapping, report, rows, create drafts);
  - a nav item "استيراد الأسئلة".

## Testing

- Unit:
  - CSV quoting (commas, quotes, newlines in cells, BOM);
  - TSV;
  - JSON shape;
  - XLSX (shared and inline strings, numbers, empty cells, entities) from a fixture built in the
    test with fflate;
  - zip-bomb and entry limits;
  - normaliser: every error code, letters and Arabic letters and numbers and text, type inference,
    difficulty forms, subskill;
  - fingerprint equivalences;
  - header suggestions.
- E2E:
  - permissions (student 403; content manager allowed);
  - upload limits and type errors;
  - process: valid, invalid and duplicate counts, including against an existing bank question;
  - mapping errors;
  - resolve;
  - create drafts: provenance, DRAFT status, not published, idempotent on a second call, the
    batch completes;
  - processing again after import → 409.
- Web unit: suggestions shown by default, base64 upload body, and status labels.
- Browser: upload a CSV, map, review the report, create drafts, then open one draft in the editor.
