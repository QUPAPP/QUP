import { unzipSync } from "fflate";
import { ImportFileInvalid } from "./import.errors.js";
import type { ImportLimits } from "./import-limits.js";

/**
 * Reads the first worksheet of an XLSX file as rows of cell text, and nothing
 * else (QUESTION_BANK_IMPORT.md "Safety"): only the workbook, its relations,
 * the shared strings and that one sheet are inflated; macros, external links
 * and every other part are never read. Entry count and inflated size are
 * capped before inflation (zip-bomb guard).
 */

const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];
const WORKBOOK = "xl/workbook.xml";
const WORKBOOK_RELS = "xl/_rels/workbook.xml.rels";
const SHARED_STRINGS = "xl/sharedStrings.xml";
const FALLBACK_SHEET = "xl/worksheets/sheet1.xml";

export function isZip(bytes: Uint8Array): boolean {
  return ZIP_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

/** Sparse rows: `rows[r][c]` is the text of the cell in row r, column c (0-based). */
export function readFirstSheet(bytes: Uint8Array, limits: ImportLimits): string[][] {
  if (!isZip(bytes)) throw new ImportFileInvalid("MALFORMED");

  let entries = 0;
  let inflated = 0;
  const wanted = new Set([WORKBOOK, WORKBOOK_RELS, SHARED_STRINGS]);
  const isSheet = (name: string) => /^xl\/worksheets\/[^/]+\.xml$/.test(name);
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (file) => {
        entries += 1;
        inflated += file.originalSize;
        if (entries > limits.maxZipEntries || inflated > limits.maxUnzippedBytes) {
          throw new ImportFileInvalid("ZIP_TOO_LARGE");
        }
        return wanted.has(file.name) || isSheet(file.name);
      },
    });
  } catch (error) {
    if (error instanceof ImportFileInvalid) throw error;
    throw new ImportFileInvalid("MALFORMED");
  }
  const actual = Object.values(files).reduce((sum, file) => sum + file.length, 0);
  if (actual > limits.maxUnzippedBytes) throw new ImportFileInvalid("ZIP_TOO_LARGE");

  const decode = (name: string) => {
    const file = files[name];
    return file ? new TextDecoder().decode(file) : null;
  };
  const sheetXml =
    decode(firstSheetPath(decode(WORKBOOK), decode(WORKBOOK_RELS)) ?? "") ?? decode(FALLBACK_SHEET);
  if (sheetXml === null) throw new ImportFileInvalid("NO_WORKSHEET");
  return readRows(sheetXml, readSharedStrings(decode(SHARED_STRINGS)));
}

/** The workbook's first `<sheet>`, through its relationship id. */
function firstSheetPath(workbook: string | null, rels: string | null): string | null {
  const relId = workbook && /<sheet\b[^>]*\br:id="([^"]+)"/.exec(workbook)?.[1];
  if (!relId || !rels) return null;
  const relation = [...rels.matchAll(/<Relationship\b([^>]*)\/?>/g)]
    .map((match) => match[1] ?? "")
    .find((attributes) => attribute(attributes, "Id") === relId);
  const target = relation ? attribute(relation, "Target") : null;
  if (!target) return null;
  // Targets are relative to xl/; an absolute one starts at the package root.
  const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
  return /^xl\/worksheets\/[^/]+\.xml$/.test(path) ? path : null;
}

function readSharedStrings(xml: string | null): string[] {
  if (!xml) return [];
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) => texts(match[1] ?? ""));
}

function readRows(xml: string, shared: readonly string[]): string[][] {
  const rows: string[][] = [];
  for (const row of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowNumber = Number(attribute(row[1] ?? "", "r"));
    const index = Number.isInteger(rowNumber) && rowNumber > 0 ? rowNumber - 1 : rows.length;
    const cells: string[] = [];
    for (const cell of (row[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attributes = cell[1] ?? "";
      const column = columnIndex(attribute(attributes, "r")) ?? cells.length;
      cells[column] = cellText(attribute(attributes, "t"), cell[2] ?? "", shared);
    }
    rows[index] = Array.from(cells, (value) => value ?? "");
  }
  return Array.from(rows, (row) => row ?? []);
}

function cellText(type: string | null, body: string, shared: readonly string[]): string {
  if (type === "inlineStr") return texts(/<is\b[^>]*>([\s\S]*?)<\/is>/.exec(body)?.[1] ?? "");
  const value = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1];
  if (value === undefined) return "";
  if (type === "s") return shared[Number(value)] ?? "";
  return decodeEntities(value);
}

/** Every `<t>` of a string item, joined: plain and rich-text runs alike. */
function texts(xml: string): string {
  return [...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
    .map((match) => decodeEntities(match[1] ?? ""))
    .join("");
}

function attribute(attributes: string, name: string): string | null {
  return new RegExp(`\\b${name}="([^"]*)"`).exec(attributes)?.[1] ?? null;
}

/** "C12" → 2. */
function columnIndex(reference: string | null): number | null {
  const letters = reference && /^([A-Z]+)\d+$/.exec(reference)?.[1];
  if (!letters) return null;
  return [...letters].reduce((sum, letter) => sum * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (whole, entity: string) => {
    if (entity.startsWith("#x")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(Number(entity.slice(1)));
    return NAMED_ENTITIES[entity] ?? whole;
  });
}
