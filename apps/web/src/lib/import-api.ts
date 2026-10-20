/**
 * Admin calls for structured question import (API_CONTRACTS.md "Imports").
 * Parsing, validation and duplicate checks are the API's; this only carries
 * the file and the person's choices.
 */

import { api } from "./api";

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

export interface ImportTotals {
  detected: number;
  valid: number;
  invalid: number;
  duplicate: number;
  imported: number;
  skipped: number;
  errors: Record<string, number>;
}

/** Column names of the file, per question field. */
export interface ImportMapping {
  stem: string;
  options: string[];
  correctAnswer: string;
  skill: string;
  subskill?: string;
  questionType?: string;
  explanation?: string;
  difficulty?: string;
  source?: string;
}

export interface ImportBatch {
  id: string;
  originalFilename: string;
  detectedType: "CSV" | "TSV" | "JSON" | "XLSX";
  status: ImportBatchStatus;
  headers: string[];
  mapping: ImportMapping | null;
  taxonomyVersionId: string | null;
  totals: ImportTotals | null;
  createdAt: string;
  completedAt: string | null;
  /** Present on a single batch: the API's guess from the column names. */
  suggestedMapping?: Partial<ImportMapping> & { options: string[] };
}

export interface ImportItem {
  id: string;
  sourceLocator: string;
  status: ImportItemStatus;
  errors: string[];
  duplicateOfQuestionId: string | null;
  resultingQuestionVersionId: string | null;
  cells: Record<string, string>;
  question: {
    stem: string;
    questionType: string;
    options: { key: string; text: string; isCorrect: boolean }[];
  } | null;
}

interface Page {
  limit: number;
  offset: number;
  hasMore: boolean;
}

const BYTE_CHUNK = 0x8000;

/** Bytes → base64 without building one giant argument list. */
export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let start = 0; start < bytes.length; start += BYTE_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(start, start + BYTE_CHUNK));
  }
  return btoa(binary);
}

export const listImports = (page: { limit: number; offset: number }) =>
  api<{ items: ImportBatch[]; page: Page }>(
    `/admin/imports?limit=${page.limit}&offset=${page.offset}`,
  );

export const uploadImport = (filename: string, bytes: Uint8Array) =>
  api<ImportBatch>("/admin/imports/upload", {
    method: "POST",
    body: { filename, contentBase64: toBase64(bytes) },
  });

export const getImport = (batchId: string) => api<ImportBatch>(`/admin/imports/${batchId}`);

export const listImportItems = (
  batchId: string,
  filter: { status?: ImportItemStatus; limit: number; offset: number },
) => {
  const query = new URLSearchParams({ limit: String(filter.limit), offset: String(filter.offset) });
  if (filter.status) query.set("status", filter.status);
  return api<{ items: ImportItem[]; page: Page }>(`/admin/imports/${batchId}/items?${query}`);
};

export const processImport = (
  batchId: string,
  body: { taxonomyVersionId: string; mapping: ImportMapping },
) => api<ImportBatch>(`/admin/imports/${batchId}/process`, { method: "POST", body });

export const resolveImportItem = (itemId: string, action: "SKIP" | "INCLUDE") =>
  api<ImportItem>(`/admin/import-items/${itemId}/resolve`, { method: "POST", body: { action } });

export const createImportDrafts = (batchId: string) =>
  api<ImportBatch>(`/admin/imports/${batchId}/create-drafts`, { method: "POST" });
