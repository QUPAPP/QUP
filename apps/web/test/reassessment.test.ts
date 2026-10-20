import { afterEach, describe, expect, it, vi } from "vitest";

import { getReassessmentResult, startReassessment } from "../src/lib/api";
import {
  COMPLETION_LABELS,
  completionHref,
  isRunnable,
  SESSION_TITLES,
} from "../src/lib/diagnostics";
import { answersText } from "../src/lib/mastery-labels";

afterEach(() => vi.unstubAllGlobals());

describe("skill reassessment", () => {
  it("starts the caller's reassessment of one skill and reads its result", async () => {
    const request = vi.fn().mockImplementation(async () => Response.json({ id: "s1" }));
    vi.stubGlobal("fetch", request);
    await startReassessment("e1", "k1");
    await getReassessmentResult("s1");
    expect(request).toHaveBeenNthCalledWith(
      1,
      "/api/v1/exams/e1/skills/k1/reassessment",
      expect.objectContaining({ method: "POST", credentials: "same-origin" }),
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      "/api/v1/assessments/s1/reassessment-result",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("runs in the session runner and ends on its own result", () => {
    expect(isRunnable("SKILL_REASSESSMENT")).toBe(true);
    expect(SESSION_TITLES.SKILL_REASSESSMENT).toBe("إعادة قياس المهارة");
    expect(completionHref({ id: "s1", examId: "e1", type: "SKILL_REASSESSMENT" })).toBe(
      "/assessments/s1/reassessment",
    );
    expect(COMPLETION_LABELS.SKILL_REASSESSMENT).toBe("عرض النتيجة");
  });

  it("counts the answers a retry still needs, in Arabic", () => {
    expect(answersText(1)).toBe("إجابة واحدة");
    expect(answersText(2)).toBe("إجابتان");
    expect(answersText(5)).toBe("5 إجابات");
    expect(answersText(11)).toBe("11 إجابة");
  });
});
