import { describe, expect, it } from "vitest";

import {
  dropNulls,
  examCreateSchema,
  percentToShare,
  shareToPercent,
  skillFormSchema,
  versionCreateSchema,
} from "../src/lib/admin-forms";
import { ApiError } from "../src/lib/api";
import { errorMessage } from "../src/lib/messages";

const skill = (overrides: Record<string, string> = {}) => ({
  code: "ANALOGY",
  name: "التناظر",
  description: "",
  weight: "",
  masteryThresholdPercent: "",
  priorityWeight: "",
  minCoverage: "",
  displayOrder: "",
  ...overrides,
});

describe("threshold as a percentage", () => {
  it("converts without floating-point noise", () => {
    expect(percentToShare(85.5)).toBe(0.855);
    expect(percentToShare(100)).toBe(1);
    expect(percentToShare(0.1)).toBe(0.001);
    expect(shareToPercent(0.855)).toBe(85.5);
  });

  it("rejects more precision than the API stores, and zero", () => {
    expect(skillFormSchema.safeParse(skill({ masteryThresholdPercent: "85.55" })).success).toBe(
      false,
    );
    expect(skillFormSchema.safeParse(skill({ masteryThresholdPercent: "0" })).success).toBe(false);
    expect(skillFormSchema.parse(skill({ masteryThresholdPercent: "85.5" })).masteryThreshold).toBe(
      0.855,
    );
  });

  it("reads Arabic-Indic digits and the Arabic decimal separator", () => {
    expect(skillFormSchema.parse(skill({ masteryThresholdPercent: "٨٥٫٥" })).masteryThreshold).toBe(
      0.855,
    );
  });

  it("leaves a blank threshold to the versioned default", () => {
    expect(skillFormSchema.parse(skill()).masteryThreshold).toBeNull();
  });
});

describe("node fields", () => {
  it("rejects a weight the database would round, and zero", () => {
    expect(skillFormSchema.safeParse(skill({ weight: "1.23456" })).success).toBe(false);
    expect(skillFormSchema.safeParse(skill({ weight: "0" })).success).toBe(false);
    expect(skillFormSchema.parse(skill({ weight: "1.2345" })).weight).toBe(1.2345);
  });

  it("requires an upper-case code", () => {
    expect(skillFormSchema.safeParse(skill({ code: "reading" })).success).toBe(false);
  });

  it("drops empty values before a create request", () => {
    const values = skillFormSchema.parse(skill());
    expect(dropNulls(values)).toEqual({ code: "ANALOGY", name: "التناظر" });
  });
});

describe("exam and version forms", () => {
  const exam = (slug: string) => ({
    code: "QUDURAT",
    slug,
    nameAr: "القدرات",
    nameEn: "",
    description: "",
  });

  it("requires a slug of lower-case words joined by hyphens", () => {
    expect(examCreateSchema.safeParse(exam("Verbal Part")).success).toBe(false);
    expect(examCreateSchema.safeParse(exam("verbal-part")).success).toBe(true);
  });

  it("sends an effective date as midnight UTC", () => {
    expect(
      versionCreateSchema.parse({ versionCode: "2026.1", effectiveFrom: "2026-11-01" })
        .effectiveFrom,
    ).toBe("2026-11-01T00:00:00.000Z");
    expect(
      versionCreateSchema.parse({ versionCode: "2026.1", effectiveFrom: "" }).effectiveFrom,
    ).toBeUndefined();
  });
});

describe("catalog error messages", () => {
  it.each(["TAXONOMY_VERSION_NOT_DRAFT", "PREREQUISITE_CYCLE", "FORBIDDEN", "TAXONOMY_INCOMPLETE"])(
    "shows %s in Arabic, never the server's text",
    (code) => {
      const message = errorMessage(new ApiError(422, code, "server text", null));
      expect(message).not.toBe("server text");
      expect(message).toMatch(/[؀-ۿ]/);
      expect(message).not.toBe(errorMessage(new ApiError(500, "UNKNOWN", "x", null)));
    },
  );
});
