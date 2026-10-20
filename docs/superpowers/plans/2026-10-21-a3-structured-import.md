# A3 Structured Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Content Manager uploads a CSV/TSV/JSON/XLSX file, maps its columns, reviews validated rows and duplicates, and turns them into DRAFT questions with provenance.

**Architecture:**
- A new `content-import` module owns the batches and items.
- Pure parsers, normaliser and fingerprint sit in its domain.
- Drafts are created through a new questions contract that reuses A2 validation.
- Files go to private storage behind a port.

**Tech Stack:** NestJS + Fastify, Drizzle, Zod, `fflate@0.8.2` (XLSX unzip), Vitest, Next.js, TanStack Query, React Hook Form.

**Spec:** `docs/superpowers/specs/2026-10-21-a3-structured-import-design.md`

## Global Constraints

- `IMPORT_LIMITS`:
  - `maxFileBytes: 2_097_152`;
  - `maxRows: 1000`;
  - `maxColumns: 50`;
  - `maxCellChars: 5000`;
  - `maxZipEntries: 200`;
  - `maxUnzippedBytes: 20_971_520`.
- Imported content never publishes itself: drafts only.
- Untrusted file content is data. It is never evaluated, and no URLs are fetched.
- Stable error codes as in the spec.
- The upload route's body limit is 3 MiB; every other route keeps the global limit.
- No migration.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No push.

## Review Focus

1. A malicious XLSX (zip bomb, huge sharedStrings, path traversal in entry names, a macro
   workbook) is refused or safely ignored and never written to disk except as the original blob.
2. Running `create-drafts` twice, or concurrently, makes one draft per row.
3. A row whose skill was archived between process and create-drafts is rejected
   (`DRAFT_REJECTED`) rather than creating an invalid draft.
4. The storage key never derives from the filename (no traversal).
5. An Arabic CSV saved by Excel (UTF-8 with BOM, CRLF) parses identically to a plain one.

---

### Task 1: Parsers and normaliser (pure)

**Files:** create in `apps/api/src/modules/content-import/domain/`:
- `import-limits.ts`;
- `tabular.ts`: `parseTabular(input: { filename; bytes: Uint8Array }): ParsedTable` and the
  `ImportFileError` reasons;
- `xlsx-reader.ts`;
- `fingerprint.ts`: `stemFingerprint(text: string): string`;
- `column-suggestions.ts`: `suggestMapping(headers)`;
- `row-normaliser.ts`: `normaliseRow(raw, mapping, outline)` → `{ ok: true; draft } | { ok: false; errors: ImportErrorCode[] }`.

Tests go in `apps/api/test/content-import/*.test.ts`. Add `fflate@0.8.2` to `apps/api`.

- [ ] Write the tests in the spec's unit list. FAIL, then implement, then PASS.
- [ ] Commit `Add structured import parsing and row rules`.

### Task 2: Import API

**Files:**
- `questions/questions.contract.ts`: `QUESTION_AUTHOR`;
- `questions/application/question-author.service.ts`;
- the store's `stemTextsInExam`;
- `content-import`:
  - module;
  - application service;
  - `infrastructure/drizzle-import-store.ts`;
  - `infrastructure/local-file-storage.ts` (port in `domain/ports.ts`);
  - presentation controller and DTOs;
  - errors;
- config: `IMPORT_STORAGE_DIR`;
- app module: register;
- `.gitignore`: `var/`;
- test: `apps/api/test/content-import/imports.e2e.test.ts`.

- [ ] E2E covering the spec's list. FAIL, then implement, then PASS, plus the API suite.
- [ ] Update API_CONTRACTS.
- [ ] Commit `Add structured question import`.

### Task 3: Import screens

**Files:**
- `apps/web/src/lib/import-api.ts`, `lib/import-mapping.ts`;
- `app/admin/imports/page.tsx`, `app/admin/imports/[batchId]/page.tsx`;
- `lib/permissions.ts` nav;
- messages;
- CSS;
- test: `apps/web/test/import.test.ts`.

- [ ] Tests:
  - the upload body is base64;
  - the mapping form defaults to the suggestion;
  - `toMappingBody` drops empty optional fields;
  - every status has a label.
- [ ] Implement, then run tests, typecheck and Biome. Commit `Add the question import screens`.

### Task 4: Docs, gates, browser

- [ ] Docs:
  - OPEN_QUESTIONS #16d;
  - IMPLEMENTATION_STATUS;
  - README;
  - QUESTION_BANK_IMPORT "V1 implementation".
- [ ] Run the gates. Browser pass: CSV upload through to drafts.
- [ ] Commit, then self-review.
