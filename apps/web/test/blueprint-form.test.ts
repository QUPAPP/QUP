import { afterEach, describe, expect, it, vi } from "vitest";

import { activateBlueprint, type Blueprint, createBlueprint } from "../src/lib/blueprint-api";
import {
  blueprintCreateSchema,
  blueprintEditSchema,
  formFromBlueprint,
  toUpdateBody,
} from "../src/lib/blueprint-form";

afterEach(() => vi.unstubAllGlobals());

const blueprint: Blueprint = {
  id: "b1",
  examId: "e1",
  type: "FULL_DIAGNOSTIC",
  code: "FULL-1",
  name: "التشخيص الكامل",
  questionCount: 40,
  status: "DRAFT",
  createdAt: "2026-10-21T00:00:00.000Z",
  updatedAt: "2026-10-21T00:00:00.000Z",
  taxonomyVersion: { id: "v1", versionCode: "2026.1", status: "PUBLISHED" },
  domains: [
    { id: "d1", name: "لفظي", taxonomyWeight: 1, weight: null },
    { id: "d2", name: "كمي", taxonomyWeight: 2, weight: 3 },
  ],
};

describe("blueprint form", () => {
  it("starts from the blueprint, a blank weight meaning the taxonomy's", () => {
    expect(formFromBlueprint(blueprint)).toEqual({
      name: "التشخيص الكامل",
      questionCount: "40",
      weights: ["", "3"],
    });
  });

  it("sends every domain's weight: blank → null, Arabic digits read as numbers", () => {
    const parsed = blueprintEditSchema.parse({
      name: " نموذج ",
      questionCount: "٣٠",
      weights: ["", "٢٫٥"],
    });
    expect(toUpdateBody(blueprint, parsed)).toEqual({
      name: "نموذج",
      questionCount: 30,
      domainWeights: [
        { domainId: "d1", weight: null },
        { domainId: "d2", weight: 2.5 },
      ],
    });
    expect(
      blueprintEditSchema.parse({ name: "x", questionCount: "1", weights: ["0", ""] }),
    ).toEqual({ name: "x", questionCount: 1, weights: [0, null] });
  });

  it("keeps the question count within 1–200 and weights within numeric(6, 4)", () => {
    const base = { type: "FULL_DIAGNOSTIC", code: "FULL-2", name: "نموذج" };
    expect(blueprintCreateSchema.safeParse({ ...base, questionCount: "0" }).success).toBe(false);
    expect(blueprintCreateSchema.safeParse({ ...base, questionCount: "201" }).success).toBe(false);
    expect(blueprintCreateSchema.safeParse({ ...base, questionCount: "40" }).success).toBe(true);
    const weight = (value: string) =>
      blueprintEditSchema.safeParse({ name: "x", questionCount: "5", weights: [value] }).success;
    expect(weight("100")).toBe(false);
    expect(weight("1.23456")).toBe(false);
    expect(weight("-1")).toBe(false);
  });

  it("calls the admin blueprint routes", async () => {
    const request = vi.fn().mockImplementation(async () => Response.json(blueprint));
    vi.stubGlobal("fetch", request);
    await createBlueprint("e1", {
      type: "MINI_DIAGNOSTIC",
      code: "MINI-1",
      name: "مصغر",
      questionCount: 12,
    });
    await activateBlueprint("b1");
    expect(request).toHaveBeenNthCalledWith(
      1,
      "/api/v1/admin/exams/e1/blueprints",
      expect.objectContaining({ method: "POST" }),
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      "/api/v1/admin/blueprints/b1/activate",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
