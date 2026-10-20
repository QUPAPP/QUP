/**
 * Upload limits for structured imports (QUESTION_BANK_IMPORT.md "Safety":
 * file size, row limits, zip-bomb protection). Exceeding any refuses the file.
 */
export const IMPORT_LIMITS = Object.freeze({
  /** 2 MiB of file. */
  maxFileBytes: 2_097_152,
  maxRows: 1000,
  maxColumns: 50,
  maxCellChars: 5000,
  /** XLSX is a ZIP: entries and inflated bytes are capped before anything is read. */
  maxZipEntries: 200,
  maxUnzippedBytes: 20_971_520,
});

export type ImportLimits = typeof IMPORT_LIMITS;

/**
 * The upload route's own JSON body limit: a 2 MiB file is about 2.7 MiB of
 * base64. Every other route keeps the global limit (bootstrap/create-app.ts).
 */
export const IMPORT_UPLOAD_BODY_LIMIT_BYTES = 3_145_728;
/** Longest base64 the upload accepts: the file limit, encoded. */
export const MAX_UPLOAD_BASE64_CHARS = Math.ceil(IMPORT_LIMITS.maxFileBytes / 3) * 4;

/** Recorded on each batch: how its rows were read. */
export const PARSER_VERSION = "structured-v1";
