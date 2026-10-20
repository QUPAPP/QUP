import { afterEach, describe, expect, it, vi } from "vitest";

import { completeSession, startTraining } from "../src/lib/api";
import {
  COMPLETION_LABELS,
  completionHref,
  correctOptions,
  isRunnable,
  SESSION_TITLES,
} from "../src/lib/diagnostics";

afterEach(() => vi.unstubAllGlobals());

const text = (value: string) => ({ blocks: [{ type: "text" as const, text: value }] });

describe("adaptive training", () => {
  it("starts or resumes the caller's training, and can end it early", async () => {
    const request = vi.fn().mockImplementation(async () => Response.json({ id: "s1" }));
    vi.stubGlobal("fetch", request);
    await startTraining("e1");
    await completeSession("s1");
    expect(request).toHaveBeenNthCalledWith(
      1,
      "/api/v1/exams/e1/assessments/training",
      expect.objectContaining({ method: "POST", credentials: "same-origin" }),
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      "/api/v1/assessments/s1/complete",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("runs in the same session runner and ends on the skill profile", () => {
    expect(isRunnable("ADAPTIVE_TRAINING")).toBe(true);
    expect(isRunnable("MOCK_EXAM")).toBe(false);
    expect(SESSION_TITLES.ADAPTIVE_TRAINING).toBe("التدريب التكيفي");
    expect(completionHref({ id: "s1", examId: "e1", type: "ADAPTIVE_TRAINING" })).toBe(
      "/exams/e1/profile",
    );
    expect(COMPLETION_LABELS.ADAPTIVE_TRAINING).toBe("عرض ملف مهاراتي");
  });

  it("reviews with the correct options in display order", () => {
    const options = [
      { key: "A", content: text("3") },
      { key: "B", content: text("4") },
      { key: "C", content: text("5") },
    ];
    expect(correctOptions(options, ["C", "A"]).map((o) => o.key)).toEqual(["A", "C"]);
    expect(correctOptions(options, [])).toEqual([]);
  });
});
