# Question Bank & Import System

## Goals

- إدارة آلاف الأسئلة بجودة عالية.
- دعم عدة صيغ عبر adapters.
- عدم نشر parsed/AI-generated content تلقائيًا.
- حفظ provenance/version/history.
- دعم preview, validation, partial failures, review.

## Initial Supported Formats

Structured:
- XLSX
- CSV
- TSV
- JSON

Documents:
- DOCX
- PDF
- TXT

Images:
- PNG
- JPG/JPEG
- WebP

لا نعد تقنيًا بـ"كل صيغة في العالم". أي صيغة غير مدعومة ترجع خطأ واضحًا ويمكن إضافة Parser جديد لاحقًا.

## Canonical Normalized Shape

```text
exam
taxonomyVersion
domain
skill
subskill
questionType
stem
options
correctAnswer
explanation
difficulty
source
mappings
```

## Structured Import

Excel/CSV يدعم Column Mapper:

```text
"السؤال"       → stem
"الإجابة أ"    → option_a
"الصحيحة"      → correct_answer
"المهارة"      → skill
```

Features:
- auto-suggest mapping.
- save mapping template.
- preview.
- row-level validation.
- batch corrections.

## PDF/DOCX/Image Pipeline

```text
Extract blocks
→ Detect question boundaries
→ Detect options/answers
→ AI-assisted structuring if useful
→ Schema validation
→ Taxonomy suggestions
→ Draft items
→ Human review
```

AI confidence is advisory only.

## Import Report

Show counts for:
- detected.
- ready.
- needs review.
- duplicate.
- missing correct answer.
- unknown taxonomy.
- parser failure.
- created drafts.

## Duplicate Detection

Layers:
1. normalized exact hash.
2. fuzzy text similarity.
3. optional embedding similarity via pgvector.
4. human confirmation for ambiguous matches.

Do not auto-delete near duplicates.

## Safety

- file size/page/row limits.
- MIME + magic/signature checks.
- private quarantine storage.
- no macros/scripts execution.
- safe archive extraction.
- zip-bomb/path traversal protection.
- sanitize rich content.
- external URL fetching disabled by default.
- async heavy parsing.

## Prompt Injection

Imported document content is untrusted data.

When AI is used:
- treat document as data, not instructions.
- no tools/actions triggered from content.
- no secrets in prompts.
- structured output only.
- schema validation.
- human review.

## Versioning

- Question = stable identity.
- QuestionVersion = exact content.
- published versions remain historically interpretable.
- attempts reference exact version.

## V1 Implementation (A3, 2026-10-21)

- Structured only: CSV, TSV, JSON, XLSX (first sheet) — module `content-import`; routes in
  API_CONTRACTS.md "Imports"; screens `/admin/imports`.
- Column mapper with auto-suggest from Arabic and English headers; preview through a row report;
  row-level validation with stable codes; duplicate layer 1 (normalized exact hash) against the
  exam's bank and the file; human INCLUDE / SKIP; drafts only, through the bank's own validation.
- Provenance: `source_type = IMPORT`, `source_reference` (source column or `file · row N`), creator,
  and `import_items.resulting_question_version_id`.
- Safety: limits above, extension + signature + UTF-8 checks, XLSX entry and inflate caps with only
  the needed parts read, originals under random keys in private storage (OPEN_QUESTIONS.md #16g).
- Not yet: DOCX/PDF/images and AI structuring, fuzzy/embedding duplicates, mapping templates,
  in-place row corrections.

## Provenance

Store:
- source type.
- source reference/file.
- imported by.
- import batch.
- optional licensing metadata.

Legal/licensing policy remains an open decision before production ingestion.
