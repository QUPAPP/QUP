import type { ImportMapping, NormalisedRow } from "./row-normaliser.js";
import type { ImportFileType } from "./tabular.js";

export type ImportBatchStatus =
  | "UPLOADED"
  | "QUEUED"
  | "PARSING"
  | "VALIDATING"
  | "READY_FOR_REVIEW"
  | "COMPLETED"
  | "PARTIALLY_FAILED"
  | "FAILED";

export type ImportItemStatus =
  | "PENDING"
  | "VALID"
  | "INVALID"
  | "DUPLICATE"
  | "IMPORTED"
  | "SKIPPED";

/** QUESTION_BANK_IMPORT.md "Import Report". */
export interface ImportTotals {
  detected: number;
  valid: number;
  invalid: number;
  duplicate: number;
  imported: number;
  skipped: number;
  /** Rows per error code. */
  errors: Record<string, number>;
}

export interface ImportBatch {
  id: string;
  uploadedBy: string | null;
  originalFilename: string;
  detectedType: ImportFileType;
  status: ImportBatchStatus;
  headers: string[];
  mapping: ImportMapping | null;
  taxonomyVersionId: string | null;
  totals: ImportTotals | null;
  createdAt: Date;
  completedAt: Date | null;
}

export interface ItemPayload {
  /** The row's cells by column name, as read. */
  raw: Record<string, string>;
  /** The canonical question, once the row validated. */
  row?: NormalisedRow;
  fingerprint?: string;
  /** Set when a person skipped the row: what it was, so INCLUDE can restore it. */
  skippedFrom?: ImportItemStatus;
}

export interface ImportItem {
  id: string;
  batchId: string;
  sourceLocator: string;
  payload: ItemPayload;
  errors: string[];
  duplicateOfQuestionId: string | null;
  status: ImportItemStatus;
  resultingQuestionVersionId: string | null;
}

export interface ItemUpdate {
  status: ImportItemStatus;
  payload: ItemPayload;
  errors: string[];
  duplicateOfQuestionId: string | null;
}

export interface ImportStore {
  /** Newest first. */
  listBatches(page: { limit: number; offset: number }): Promise<{
    items: ImportBatch[];
    hasMore: boolean;
  }>;
  /** The batch and one PENDING item per row, in one transaction. */
  createBatch(input: {
    uploadedBy: string | null;
    originalFilename: string;
    detectedType: ImportFileType;
    objectKey: string;
    parserVersion: string;
    headers: string[];
    rows: { locator: string; raw: Record<string, string> }[];
    totals: ImportTotals;
  }): Promise<ImportBatch>;
  findBatch(batchId: string): Promise<ImportBatch | null>;
  /** Items in row order, optionally of one status. */
  items(
    batchId: string,
    filter: { status?: ImportItemStatus; limit: number; offset: number },
  ): Promise<{ items: ImportItem[]; hasMore: boolean }>;
  allItems(batchId: string): Promise<ImportItem[]>;
  findItem(itemId: string): Promise<ImportItem | null>;
  /** Writes every item's new outcome and the batch's mapping, in one transaction. */
  saveProcessing(
    batchId: string,
    input: {
      mapping: ImportMapping;
      taxonomyVersionId: string;
      items: (ItemUpdate & { id: string })[];
    },
  ): Promise<void>;
  updateItem(
    itemId: string,
    update: Omit<ItemUpdate, "duplicateOfQuestionId">,
  ): Promise<ImportItem>;
  /** VALID → IMPORTED, atomically: false when another request claimed it first. */
  claimForImport(itemId: string): Promise<boolean>;
  recordImported(itemId: string, questionVersionId: string): Promise<void>;
  recordRejected(itemId: string, errors: string[]): Promise<void>;
  updateBatch(
    batchId: string,
    input: { status?: ImportBatchStatus; totals: ImportTotals; completed?: boolean },
  ): Promise<ImportBatch>;
}

export const IMPORT_STORE = Symbol("IMPORT_STORE");

/** Private storage for uploaded originals (QUESTION_BANK_IMPORT.md "private quarantine storage"). */
export interface ImportFileStorage {
  /** Stores the bytes under a new random key and returns the key — never a caller's path. */
  save(bytes: Uint8Array): Promise<string>;
}

export const IMPORT_FILE_STORAGE = Symbol("IMPORT_FILE_STORAGE");
