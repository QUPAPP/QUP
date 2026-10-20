import { afterEach, describe, expect, it, vi } from "vitest";

import { startFullDiagnostic } from "../src/lib/api";
import {
  COMPLETION_LABELS,
  completionHref,
  DIAGNOSTIC_TITLES,
  isDiagnostic,
} from "../src/lib/diagnostics";

afterEach(() => vi.unstubAllGlobals());

describe("full diagnostic", () => {
  it("starts or resumes the caller's own full diagnostic", async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ id: "s1" }));
    vi.stubGlobal("fetch", request);
    await startFullDiagnostic("e1");
    expect(request).toHaveBeenCalledWith(
      "/api/v1/exams/e1/assessments/full-diagnostic",
      expect.objectContaining({ method: "POST", credentials: "same-origin" }),
    );
  });

  it("ends the mini diagnostic on its result and the full one on the skill profile", () => {
    expect(completionHref({ id: "s1", examId: "e1", type: "MINI_DIAGNOSTIC" })).toBe(
      "/assessments/s1/result",
    );
    expect(completionHref({ id: "s2", examId: "e1", type: "FULL_DIAGNOSTIC" })).toBe(
      "/exams/e1/profile",
    );
  });

  it("names the last button after where it leads", () => {
    expect(COMPLETION_LABELS.MINI_DIAGNOSTIC).toBe("عرض النتيجة");
    expect(COMPLETION_LABELS.FULL_DIAGNOSTIC).toBe("عرض ملف مهاراتي");
  });

  it("titles both diagnostics in Arabic and recognises only them", () => {
    expect(DIAGNOSTIC_TITLES.MINI_DIAGNOSTIC).toBe("التشخيص المصغّر");
    expect(DIAGNOSTIC_TITLES.FULL_DIAGNOSTIC).toBe("التشخيص الكامل");
    expect(isDiagnostic("FULL_DIAGNOSTIC")).toBe(true);
    expect(isDiagnostic("PRACTICE")).toBe(false);
  });
});
