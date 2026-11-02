import { afterEach, describe, expect, it, vi } from "vitest";

import { getMockResult, startMockExam } from "../src/lib/api";
import {
  COMPLETION_LABELS,
  completionHref,
  formatCountdown,
  isRunnable,
  SESSION_TITLES,
} from "../src/lib/diagnostics";
import { durationText, reviewFilterMatches } from "../src/lib/mock-exam";

afterEach(() => vi.unstubAllGlobals());

describe("mock exam", () => {
  it("starts or resumes the mock exam and reads its result", async () => {
    const request = vi.fn().mockImplementation(async () => Response.json({ id: "s1" }));
    vi.stubGlobal("fetch", request);
    await startMockExam("e1");
    await getMockResult("s1");
    expect(request).toHaveBeenNthCalledWith(
      1,
      "/api/v1/exams/e1/assessments/mock-exam",
      expect.objectContaining({ method: "POST" }),
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      "/api/v1/assessments/s1/mock-result",
      expect.anything(),
    );
  });

  it("plays in the session runner and ends on its own result", () => {
    expect(isRunnable("MOCK_EXAM")).toBe(true);
    expect(SESSION_TITLES.MOCK_EXAM).toBe("الاختبار المحاكي");
    expect(COMPLETION_LABELS.MOCK_EXAM).toBe("عرض النتيجة");
    expect(completionHref({ id: "s1", examId: "e1", type: "MOCK_EXAM" })).toBe(
      "/assessments/s1/mock-result",
    );
  });

  it("formats the remaining time and never goes below zero", () => {
    expect(formatCountdown(50 * 60 * 1000)).toBe("50:00");
    expect(formatCountdown(65_500)).toBe("1:06");
    expect(formatCountdown(2 * 3600 * 1000 + 5000)).toBe("2:00:05");
    expect(formatCountdown(-3000)).toBe("0:00");
  });
});

describe("mock exam result wording", () => {
  it("filters the review by outcome", () => {
    expect(reviewFilterMatches("INCORRECT", "WRONG")).toBe(true);
    expect(reviewFilterMatches("NOT_ANSWERED", "WRONG")).toBe(false);
    expect(reviewFilterMatches("NOT_ANSWERED", "NOT_ANSWERED")).toBe(true);
    expect(reviewFilterMatches("CORRECT", "ALL")).toBe(true);
  });

  it("says how long the exam took", () => {
    const start = "2026-01-01T10:00:00Z";
    expect(durationText(start, "2026-01-01T10:00:20Z")).toBe("دقيقة");
    expect(durationText(start, "2026-01-01T10:02:00Z")).toBe("دقيقتان");
    expect(durationText(start, "2026-01-01T10:07:00Z")).toBe("7 دقائق");
    expect(durationText(start, "2026-01-01T10:48:00Z")).toBe("48 دقيقة");
    expect(durationText(null, start)).toBeNull();
  });
});
