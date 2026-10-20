import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { IMPORT_LIMITS } from "../../src/modules/content-import/domain/import-limits.js";
import { parseTabular } from "../../src/modules/content-import/domain/tabular.js";

/** QUESTION_BANK_IMPORT.md "Structured" and "Safety". */

const text = (value: string) => new TextEncoder().encode(value);
const problem = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return (
      (error as { code?: string; details?: { reason?: string } }).details?.reason ??
      (error as { code?: string }).code
    );
  }
  return "NO_ERROR";
};

function xlsx(sheetXml: string, sharedStrings?: string, extra: Record<string, Uint8Array> = {}) {
  return zipSync({
    "xl/workbook.xml": strToU8(
      '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Q" sheetId="1" r:id="rId7"/></sheets></workbook>',
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      '<Relationships><Relationship Id="rId7" Type="worksheet" Target="worksheets/data.xml"/></Relationships>',
    ),
    "xl/worksheets/data.xml": strToU8(`<worksheet><sheetData>${sheetXml}</sheetData></worksheet>`),
    ...(sharedStrings ? { "xl/sharedStrings.xml": strToU8(`<sst>${sharedStrings}</sst>`) } : {}),
    ...extra,
  });
}

describe("CSV and TSV", () => {
  it("reads quoted cells with commas, quotes and line breaks, and an Excel BOM with CRLF", () => {
    const table = parseTabular({
      filename: "bank.csv",
      bytes: text('﻿السؤال,أ,ب\r\n"كم، تقريبًا؟","قال ""نعم""","سطر\nثانٍ"\r\n\r\n'),
    });
    expect(table).toEqual({
      type: "CSV",
      headers: ["السؤال", "أ", "ب"],
      rows: [["كم، تقريبًا؟", 'قال "نعم"', "سطر\nثانٍ"]],
    });
  });

  it("reads TSV, pads short rows and names blank headers", () => {
    const table = parseTabular({ filename: "bank.tsv", bytes: text("a\t\tc\n1\t2\n") });
    expect(table.headers).toEqual(["a", "عمود 2", "c"]);
    expect(table.rows).toEqual([["1", "2", ""]]);
  });

  it("refuses a row with more filled cells than headers, rather than dropping data", () => {
    expect(problem(() => parseTabular({ filename: "x.csv", bytes: text("a\n1,2\n") }))).toBe(
      "MALFORMED",
    );
  });

  it("refuses binary or non-UTF-8 text", () => {
    expect(
      problem(() => parseTabular({ filename: "x.csv", bytes: new Uint8Array([97, 0, 98]) })),
    ).toBe("BINARY_CONTENT");
    expect(
      problem(() => parseTabular({ filename: "x.csv", bytes: new Uint8Array([0xff, 0xfe, 0x41]) })),
    ).toBe("NOT_UTF8");
  });
});

describe("JSON", () => {
  it("reads an array of flat objects, keys in first-seen order", () => {
    const table = parseTabular({
      filename: "bank.json",
      bytes: text(
        JSON.stringify([
          { q: "س1", d: 0.5 },
          { q: "س2", extra: true },
        ]),
      ),
    });
    expect(table).toEqual({
      type: "JSON",
      headers: ["q", "d", "extra"],
      rows: [
        ["س1", "0.5", ""],
        ["س2", "", "true"],
      ],
    });
  });

  it("refuses anything else", () => {
    expect(problem(() => parseTabular({ filename: "x.json", bytes: text('{"a":1}') }))).toBe(
      "MALFORMED",
    );
    expect(
      problem(() => parseTabular({ filename: "x.json", bytes: text('[{"a":{"b":1}}]') })),
    ).toBe("MALFORMED");
  });
});

describe("XLSX", () => {
  it("reads the first sheet: shared, rich and inline strings, numbers, gaps and entities", () => {
    const table = parseTabular({
      filename: "bank.xlsx",
      bytes: xlsx(
        '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>' +
          '<row r="3"><c r="A3" t="inlineStr"><is><t>2 &lt; 3 &amp; ٤</t></is></c><c r="B3"><v>0.75</v></c><c r="C3" t="s"><v>2</v></c></row>',
        '<si><t>السؤال</t></si><si><r><t>الصعو</t></r><r><t xml:space="preserve">بة</t></r></si><si><t>&#1587;&#1607;&#1604;</t></si>',
      ),
    });
    expect(table).toEqual({
      type: "XLSX",
      headers: ["السؤال", "عمود 2", "الصعوبة"],
      rows: [["2 < 3 & ٤", "0.75", "سهل"]],
    });
  });

  it("refuses a file that is not a workbook", () => {
    expect(problem(() => parseTabular({ filename: "x.xlsx", bytes: text("a,b") }))).toBe(
      "MALFORMED",
    );
  });

  it("refuses archives with too many entries or too much uncompressed data", () => {
    const many: Record<string, Uint8Array> = {};
    for (let n = 0; n <= IMPORT_LIMITS.maxZipEntries; n++) many[`junk/${n}.bin`] = strToU8("x");
    expect(
      problem(() => parseTabular({ filename: "x.xlsx", bytes: xlsx("", undefined, many) })),
    ).toBe("ZIP_TOO_LARGE");
    const bomb = xlsx("", undefined, {
      "xl/bomb.bin": new Uint8Array(IMPORT_LIMITS.maxUnzippedBytes + 1),
    });
    expect(problem(() => parseTabular({ filename: "x.xlsx", bytes: bomb }))).toBe("ZIP_TOO_LARGE");
  });
});

describe("limits", () => {
  it("refuses unknown types, empty files and too many rows or columns", () => {
    expect(problem(() => parseTabular({ filename: "x.docx", bytes: text("a") }))).toBe(
      "IMPORT_FILE_TYPE_UNSUPPORTED",
    );
    expect(problem(() => parseTabular({ filename: "x.csv", bytes: text("\n\n") }))).toBe("EMPTY");
    const rows = Array.from({ length: IMPORT_LIMITS.maxRows + 1 }, (_, n) => `r${n}`).join("\n");
    expect(problem(() => parseTabular({ filename: "x.csv", bytes: text(`h\n${rows}`) }))).toBe(
      "TOO_MANY_ROWS",
    );
    const wide = Array.from({ length: IMPORT_LIMITS.maxColumns + 1 }, (_, n) => `c${n}`).join(",");
    expect(problem(() => parseTabular({ filename: "x.csv", bytes: text(wide) }))).toBe(
      "TOO_MANY_COLUMNS",
    );
    expect(
      problem(() =>
        parseTabular({
          filename: "x.csv",
          bytes: text(`h\n${"x".repeat(IMPORT_LIMITS.maxCellChars + 1)}`),
        }),
      ),
    ).toBe("CELL_TOO_LONG");
  });
});
