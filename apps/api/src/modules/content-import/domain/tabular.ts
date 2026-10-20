import {
  ImportFileInvalid,
  ImportFileTooLarge,
  ImportFileTypeUnsupported,
} from "./import.errors.js";
import { IMPORT_LIMITS, type ImportLimits } from "./import-limits.js";
import { readFirstSheet } from "./xlsx-reader.js";

/**
 * Structured files as one table (QUESTION_BANK_IMPORT.md "Structured"): the
 * first non-empty row names the columns, every later non-empty row is a
 * question. Untrusted input: read as data only, under IMPORT_LIMITS.
 */

export type ImportFileType = "CSV" | "TSV" | "JSON" | "XLSX";

export interface ParsedTable {
  type: ImportFileType;
  headers: string[];
  /** One entry per header, in order; missing cells are "". */
  rows: string[][];
}

const TYPES_BY_EXTENSION: Record<string, ImportFileType> = {
  csv: "CSV",
  tsv: "TSV",
  json: "JSON",
  xlsx: "XLSX",
};

export function fileTypeOf(filename: string): ImportFileType {
  const extension = /\.([a-z0-9]+)$/i.exec(filename)?.[1]?.toLowerCase() ?? "";
  const type = TYPES_BY_EXTENSION[extension];
  if (!type) throw new ImportFileTypeUnsupported();
  return type;
}

export function parseTabular(
  input: { filename: string; bytes: Uint8Array },
  limits: ImportLimits = IMPORT_LIMITS,
): ParsedTable {
  const type = fileTypeOf(input.filename);
  if (input.bytes.length > limits.maxFileBytes) throw new ImportFileTooLarge(limits.maxFileBytes);

  const grid =
    type === "XLSX"
      ? readFirstSheet(input.bytes, limits)
      : type === "JSON"
        ? readJson(decodeText(input.bytes))
        : readDelimited(decodeText(input.bytes), type === "TSV" ? "\t" : ",");
  return toTable(type, grid, limits);
}

function decodeText(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ImportFileInvalid("NOT_UTF8");
  }
  if (text.includes("\u0000")) throw new ImportFileInvalid("BINARY_CONTENT");
  return text.startsWith("﻿") ? text.slice(1) : text;
}

/** RFC 4180: quoted cells may hold the delimiter, line breaks and doubled quotes. */
function readDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"' && cell === "") {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (quoted) throw new ImportFileInvalid("MALFORMED");
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** An array of flat objects; the columns are the keys in the order first seen. */
function readJson(text: string): string[][] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ImportFileInvalid("MALFORMED");
  }
  if (!Array.isArray(data)) throw new ImportFileInvalid("MALFORMED");
  const headers: string[] = [];
  const records = data.map((entry) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new ImportFileInvalid("MALFORMED");
    }
    for (const key of Object.keys(entry)) if (!headers.includes(key)) headers.push(key);
    return entry as Record<string, unknown>;
  });
  return [headers, ...records.map((record) => headers.map((header) => scalarText(record[header])))];
}

function scalarText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  throw new ImportFileInvalid("MALFORMED");
}

function toTable(type: ImportFileType, grid: string[][], limits: ImportLimits): ParsedTable {
  const nonEmpty = grid.filter((row) => row.some((cell) => cell.trim() !== ""));
  const [headerRow, ...rows] = nonEmpty;
  if (!headerRow) throw new ImportFileInvalid("EMPTY");
  if (headerRow.length > limits.maxColumns) throw new ImportFileInvalid("TOO_MANY_COLUMNS");
  if (rows.length > limits.maxRows) throw new ImportFileInvalid("TOO_MANY_ROWS");

  const headers = uniqueHeaders(headerRow);
  const aligned = rows.map((row) => {
    if (row.slice(headers.length).some((cell) => cell.trim() !== "")) {
      throw new ImportFileInvalid("MALFORMED");
    }
    return headers.map((_, index) => row[index] ?? "");
  });
  for (const cell of [...headers, ...aligned.flat()]) {
    if (cell.length > limits.maxCellChars) throw new ImportFileInvalid("CELL_TOO_LONG");
  }
  return { type, headers, rows: aligned };
}

/** Blank headers get a position name; repeats get a number, so every column is addressable. */
function uniqueHeaders(row: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return row.map((raw, index) => {
    const base = raw.trim() || `عمود ${index + 1}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  });
}
