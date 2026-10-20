import { afterEach, describe, expect, it, vi } from "vitest";

import { type ImportBatch, uploadImport } from "../src/lib/import-api";
import {
  BATCH_STATUS_LABELS,
  formFromBatch,
  ITEM_STATUS_LABELS,
  rowErrorLabel,
  toProcessBody,
} from "../src/lib/import-mapping";

afterEach(() => vi.unstubAllGlobals());

const batch: ImportBatch = {
  id: "b1",
  originalFilename: "bank.csv",
  detectedType: "CSV",
  status: "UPLOADED",
  headers: ["السؤال", "أ", "ب", "الصحيحة", "المهارة"],
  mapping: null,
  taxonomyVersionId: null,
  totals: null,
  createdAt: "2026-10-21T00:00:00.000Z",
  completedAt: null,
  suggestedMapping: {
    stem: "السؤال",
    options: ["أ", "ب"],
    correctAnswer: "الصحيحة",
    skill: "المهارة",
  },
};

describe("question import", () => {
  it("uploads the file as base64 in a JSON body", async () => {
    const request = vi.fn().mockResolvedValue(Response.json(batch));
    vi.stubGlobal("fetch", request);
    const bytes = new TextEncoder().encode("السؤال,أ\nكم؟,١");
    await uploadImport("bank.csv", bytes);
    const [url, init] = request.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/admin/imports/upload");
    expect(JSON.parse(String(init.body))).toEqual({
      filename: "bank.csv",
      contentBase64: Buffer.from(bytes).toString("base64"),
    });
  });

  it("starts the mapping form from the suggestion, then from the last mapping used", () => {
    expect(formFromBatch(batch)).toEqual({
      taxonomyVersionId: "",
      stem: "السؤال",
      options: ["أ", "ب", "", "", "", ""],
      correctAnswer: "الصحيحة",
      skill: "المهارة",
      subskill: "",
      questionType: "",
      explanation: "",
      difficulty: "",
      source: "",
    });
    const used = formFromBatch({
      ...batch,
      taxonomyVersionId: "v1",
      mapping: { stem: "أ", options: ["ب", "السؤال"], correctAnswer: "الصحيحة", skill: "المهارة" },
    });
    expect([used.taxonomyVersionId, used.stem, used.options[1]]).toEqual(["v1", "أ", "السؤال"]);
  });

  it("sends only the fields that were mapped", () => {
    expect(
      toProcessBody({
        ...formFromBatch(batch),
        taxonomyVersionId: "v1",
        options: ["أ", "", "ب", "", "", ""],
        difficulty: "الصعوبة",
      }),
    ).toEqual({
      taxonomyVersionId: "v1",
      mapping: {
        stem: "السؤال",
        options: ["أ", "ب"],
        correctAnswer: "الصحيحة",
        skill: "المهارة",
        difficulty: "الصعوبة",
      },
    });
  });

  it("names every status and row problem in Arabic", () => {
    for (const label of [
      ...Object.values(ITEM_STATUS_LABELS),
      ...Object.values(BATCH_STATUS_LABELS),
    ]) {
      expect(label).toMatch(/[؀-ۿ]/);
    }
    expect(rowErrorLabel("SKILL_UNKNOWN")).toBe("المهارة غير موجودة في نسخة التصنيف");
    expect(rowErrorLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW");
  });
});
