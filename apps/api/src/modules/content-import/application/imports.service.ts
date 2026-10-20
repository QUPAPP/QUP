import { Inject, Injectable } from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import type { ActorContext } from "../../../common/actor.js";
import { DomainError } from "../../../common/errors/domain-error.js";
import { CATALOG_LOOKUP, type CatalogLookup } from "../../catalog/catalog.contract.js";
import {
  DEFAULT_ATTRIBUTION_WEIGHT,
  type DraftContent,
  QUESTION_AUTHOR,
  type QuestionAuthor,
  type RichContent,
} from "../../questions/questions.contract.js";
import { type SuggestedMapping, suggestMapping } from "../domain/column-suggestions.js";
import { stemFingerprint } from "../domain/fingerprint.js";
import {
  ImportAlreadyImported,
  ImportItemNotFound,
  ImportItemNotResolvable,
  ImportMappingInvalid,
  ImportNotFound,
  ImportNotProcessed,
  ImportTaxonomyVersionNotFound,
} from "../domain/import.errors.js";
import { PARSER_VERSION } from "../domain/import-limits.js";
import {
  IMPORT_FILE_STORAGE,
  IMPORT_STORE,
  type ImportBatch,
  type ImportFileStorage,
  type ImportItem,
  type ImportItemStatus,
  type ImportStore,
  type ImportTotals,
  type ItemUpdate,
} from "../domain/ports.js";
import {
  type ImportMapping,
  type ImportOutline,
  type NormalisedRow,
  normaliseRow,
} from "../domain/row-normaliser.js";
import { parseTabular } from "../domain/tabular.js";

/** Provenance written on every imported draft (QUESTION_BANK_IMPORT.md "Provenance"). */
const IMPORT_SOURCE_TYPE = "IMPORT";
/** The first data row of a file is its second row: the first names the columns. */
const FIRST_DATA_ROW = 2;
const REQUIRED_FIELDS = ["stem", "correctAnswer", "skill"] as const;
const OPTIONAL_FIELDS = [
  "subskill",
  "questionType",
  "explanation",
  "difficulty",
  "source",
] as const;

export type ResolveAction = "SKIP" | "INCLUDE";

/**
 * Structured question import (QUESTION_BANK_IMPORT.md "Structured Import"):
 * upload → map columns → validate and find duplicates → a person reviews →
 * DRAFT questions with provenance. Nothing imported is ever published here:
 * drafts enter the same review as hand-written ones (WORKFLOWS.md §7).
 */
@Injectable()
export class ImportsService {
  constructor(
    @Inject(IMPORT_STORE) private readonly store: ImportStore,
    @Inject(IMPORT_FILE_STORAGE) private readonly files: ImportFileStorage,
    @Inject(CATALOG_LOOKUP) private readonly catalog: CatalogLookup,
    @Inject(QUESTION_AUTHOR) private readonly author: QuestionAuthor,
    @InjectPinoLogger(ImportsService.name) private readonly logger: PinoLogger,
  ) {}

  list(page: { limit: number; offset: number }) {
    return this.store.listBatches(page);
  }

  async get(batchId: string): Promise<{ batch: ImportBatch; suggestedMapping: SuggestedMapping }> {
    const batch = await this.found(batchId);
    return { batch, suggestedMapping: suggestMapping(batch.headers) };
  }

  items(batchId: string, filter: { status?: ImportItemStatus; limit: number; offset: number }) {
    return this.found(batchId).then(() => this.store.items(batchId, filter));
  }

  /** Reads the file under IMPORT_LIMITS, keeps the original privately, one PENDING item per row. */
  async upload(input: { filename: string; bytes: Uint8Array }, actor: ActorContext) {
    const table = parseTabular(input);
    const objectKey = await this.files.save(input.bytes);
    const rows = table.rows.map((cells, index) => ({
      locator: `row ${index + FIRST_DATA_ROW}`,
      raw: Object.fromEntries(table.headers.map((header, column) => [header, cells[column] ?? ""])),
    }));
    const batch = await this.store.createBatch({
      uploadedBy: actor.userId,
      originalFilename: input.filename,
      detectedType: table.type,
      objectKey,
      parserVersion: PARSER_VERSION,
      headers: table.headers,
      rows,
      totals: totalsOf(rows.map(() => ({ status: "PENDING" as const, errors: [] }))),
    });
    this.logger.info({ batchId: batch.id, type: table.type, rows: rows.length }, "Import uploaded");
    return { batch, suggestedMapping: suggestMapping(batch.headers) };
  }

  /**
   * Validates every row against the mapping and taxonomy version, and marks
   * duplicates of the bank and of earlier rows (layer 1: normalised exact
   * hash). Can run again with another mapping until drafts exist; a person's
   * earlier SKIP / INCLUDE choices are reset with it.
   */
  async process(batchId: string, input: { taxonomyVersionId: string; mapping: ImportMapping }) {
    const batch = await this.found(batchId);
    const items = await this.store.allItems(batchId);
    if (items.some((item) => item.status === "IMPORTED")) throw new ImportAlreadyImported();

    const status = await this.catalog.versionStatus(input.taxonomyVersionId);
    const outline =
      status && status !== "ARCHIVED"
        ? await this.catalog.activeOutline(input.taxonomyVersionId)
        : null;
    if (!outline) throw new ImportTaxonomyVersionNotFound();
    assertMappingFits(input.mapping, batch.headers);

    const nodes: ImportOutline = { skills: outline.domains.flatMap((domain) => domain.skills) };
    const bank = new Map<string, string>();
    for (const question of await this.author.stemTextsInExam(outline.version.examId)) {
      bank.set(stemFingerprint(question.text), question.questionId);
    }
    const earlier = new Set<string>();
    const updates = items.map((item): ItemUpdate & { id: string } => {
      const outcome = this.validate(item, input.mapping, input.taxonomyVersionId, nodes, batch);
      if (outcome.status !== "VALID") return { id: item.id, ...outcome };
      const fingerprint = outcome.payload.fingerprint ?? "";
      const inBank = bank.get(fingerprint);
      const inFile = earlier.has(fingerprint);
      earlier.add(fingerprint);
      if (inBank || inFile) {
        return {
          id: item.id,
          ...outcome,
          status: "DUPLICATE",
          errors: [inBank ? "DUPLICATE_IN_BANK" : "DUPLICATE_IN_FILE"],
          duplicateOfQuestionId: inBank ?? null,
        };
      }
      return { id: item.id, ...outcome };
    });

    await this.store.saveProcessing(batchId, { ...input, items: updates });
    return this.refreshTotals(batchId);
  }

  /** SKIP any row not yet imported; INCLUDE a duplicate a person judged distinct, or undo a skip. */
  async resolve(itemId: string, action: ResolveAction): Promise<ImportItem> {
    const item = await this.store.findItem(itemId);
    if (!item) throw new ImportItemNotFound();
    let update: Omit<ItemUpdate, "duplicateOfQuestionId">;
    if (action === "SKIP" && item.status !== "IMPORTED" && item.status !== "SKIPPED") {
      update = {
        status: "SKIPPED",
        payload: { ...item.payload, skippedFrom: item.status },
        errors: item.errors,
      };
    } else if (action === "INCLUDE" && item.status === "DUPLICATE") {
      update = { status: "VALID", payload: item.payload, errors: item.errors };
    } else if (action === "INCLUDE" && item.status === "SKIPPED" && item.payload.skippedFrom) {
      const { skippedFrom, ...payload } = item.payload;
      update = { status: skippedFrom, payload, errors: item.errors };
    } else {
      throw new ImportItemNotResolvable(item.status, action);
    }
    const updated = await this.store.updateItem(itemId, update);
    await this.refreshTotals(item.batchId);
    return updated;
  }

  /**
   * One DRAFT per VALID row, through the question bank's own validation. Each
   * row is claimed before its draft is written, so concurrent or repeated
   * calls never import a row twice.
   */
  async createDrafts(batchId: string, actor: ActorContext): Promise<ImportBatch> {
    const batch = await this.found(batchId);
    if (!batch.taxonomyVersionId || !batch.mapping) throw new ImportNotProcessed();
    for (const item of await this.store.allItems(batchId)) {
      if (item.status !== "VALID" || !item.payload.row) continue;
      if (!(await this.store.claimForImport(item.id))) continue;
      try {
        const draft = await this.author.createDraft(
          toDraftContent(item.payload.row, batch.taxonomyVersionId, sourceOf(item, batch)),
          actor,
        );
        await this.store.recordImported(item.id, draft.versionId);
      } catch (error) {
        // The bank refused it (e.g. a skill archived since processing): the row says so.
        if (!(error instanceof DomainError)) throw error;
        await this.store.recordRejected(item.id, ["DRAFT_REJECTED", error.code]);
      }
    }
    const items = await this.store.allItems(batchId);
    const rejected = items.some((item) => item.errors.includes("DRAFT_REJECTED"));
    const batchAfter = await this.store.updateBatch(batchId, {
      status: rejected ? "PARTIALLY_FAILED" : "COMPLETED",
      totals: totalsOf(items),
      completed: true,
    });
    this.logger.info({ batchId, totals: batchAfter.totals }, "Import drafts created");
    return batchAfter;
  }

  private validate(
    item: ImportItem,
    mapping: ImportMapping,
    taxonomyVersionId: string,
    outline: ImportOutline,
    batch: ImportBatch,
  ): ItemUpdate {
    const base = { payload: { raw: item.payload.raw }, duplicateOfQuestionId: null };
    const normalised = normaliseRow(item.payload.raw, mapping, outline);
    if (!normalised.ok) return { ...base, status: "INVALID", errors: normalised.errors };
    const problems = this.author.contentProblems(
      toDraftContent(normalised.row, taxonomyVersionId, sourceOf(item, batch)),
    );
    if (problems.length > 0) {
      return { ...base, status: "INVALID", errors: [...new Set(problems.map((p) => p.rule))] };
    }
    return {
      ...base,
      status: "VALID",
      payload: {
        raw: item.payload.raw,
        row: normalised.row,
        fingerprint: stemFingerprint(normalised.row.stem),
      },
      errors: [],
    };
  }

  private async refreshTotals(batchId: string): Promise<ImportBatch> {
    return this.store.updateBatch(batchId, {
      totals: totalsOf(await this.store.allItems(batchId)),
    });
  }

  private async found(batchId: string): Promise<ImportBatch> {
    const batch = await this.store.findBatch(batchId);
    if (!batch) throw new ImportNotFound();
    return batch;
  }
}

/** Every mapped column must exist; the required fields must be mapped; options 2–6, distinct. */
function assertMappingFits(mapping: ImportMapping, headers: readonly string[]): void {
  const known = new Set(headers);
  const bad: string[] = [];
  for (const field of REQUIRED_FIELDS) {
    if (!known.has(mapping[field])) bad.push(field);
  }
  const optionsOk =
    mapping.options.length >= 2 &&
    new Set(mapping.options).size === mapping.options.length &&
    mapping.options.every((column) => known.has(column));
  if (!optionsOk) bad.push("options");
  for (const field of OPTIONAL_FIELDS) {
    const column = mapping[field];
    if (column !== undefined && !known.has(column)) bad.push(field);
  }
  if (bad.length > 0) throw new ImportMappingInvalid(bad);
}

function sourceOf(item: ImportItem, batch: ImportBatch): string {
  return `${batch.originalFilename} · ${item.sourceLocator}`;
}

const textContent = (text: string): RichContent => ({ blocks: [{ type: "text", text }] });

function toDraftContent(
  row: NormalisedRow,
  taxonomyVersionId: string,
  fallbackSource: string,
): DraftContent {
  return {
    questionType: row.questionType,
    stem: textContent(row.stem),
    explanation: row.explanation ? textContent(row.explanation) : null,
    difficulty: row.difficulty,
    taxonomyVersionId,
    sourceType: IMPORT_SOURCE_TYPE,
    sourceReference: row.source ?? fallbackSource,
    options: row.options.map((option, index) => ({
      key: option.key,
      content: textContent(option.text),
      isCorrect: option.isCorrect,
      displayOrder: index,
    })),
    mappings: [
      {
        skillId: row.skillId,
        subskillId: row.subskillId,
        role: "PRIMARY",
        attributionWeight: DEFAULT_ATTRIBUTION_WEIGHT.PRIMARY,
        rationale: null,
      },
    ],
  };
}

function totalsOf(items: readonly { status: ImportItemStatus; errors: string[] }[]): ImportTotals {
  const count = (status: ImportItemStatus) => items.filter((item) => item.status === status).length;
  const errors: Record<string, number> = {};
  for (const item of items) {
    if (item.status === "IMPORTED" || item.status === "VALID") continue;
    for (const code of item.errors) errors[code] = (errors[code] ?? 0) + 1;
  }
  return {
    detected: items.length,
    valid: count("VALID"),
    invalid: count("INVALID"),
    duplicate: count("DUPLICATE"),
    imported: count("IMPORTED"),
    skipped: count("SKIPPED"),
    errors,
  };
}
