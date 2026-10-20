import { afterEach, describe, expect, it, vi } from "vitest";

import { getDashboard, type NextStep } from "../src/lib/api";
import { improvementText, nextStepLink } from "../src/lib/next-step";

afterEach(() => vi.unstubAllGlobals());

describe("student dashboard", () => {
  it("reads the caller's own dashboard", async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ exams: [] }));
    vi.stubGlobal("fetch", request);
    await getDashboard();
    expect(request).toHaveBeenCalledWith(
      "/api/v1/me/dashboard",
      expect.objectContaining({ method: "GET", credentials: "same-origin" }),
    );
  });

  it.each<[NextStep, string, string]>([
    [
      { type: "RESUME_SESSION", sessionId: "s1", sessionType: "ADAPTIVE_TRAINING" },
      "/assessments/s1",
      "أكمل التدريب التكيفي",
    ],
    [
      { type: "RESUME_SESSION", sessionId: "s2", sessionType: "MOCK_EXAM" },
      "/assessments/s2",
      "أكمل جلستك",
    ],
    [{ type: "START_MINI_DIAGNOSTIC" }, "/exams/e1/diagnostic", "ابدأ التشخيص المصغّر"],
    [{ type: "SUBSCRIBE" }, "/subscriptions", "اشترك لتكمل رحلتك"],
    [{ type: "START_FULL_DIAGNOSTIC" }, "/exams/e1/full-diagnostic", "ابدأ التشخيص الكامل"],
    [
      { type: "REASSESS", skillId: "k1", skillName: "التناظر" },
      "/exams/e1/skills/k1/reassessment",
      "أعد قياس: التناظر",
    ],
    [{ type: "TRAIN", skillName: "الاستيعاب" }, "/exams/e1/training", "تدرّب على: الاستيعاب"],
    [{ type: "TRAIN", skillName: null }, "/exams/e1/training", "ابدأ التدريب"],
    [{ type: "ALL_MASTERED" }, "/exams/e1/profile", "أتقنت كل المهارات — ملف مهاراتي"],
  ])("links %j", (step, href, label) => {
    expect(nextStepLink(step, "e1")).toEqual({ href, label });
  });

  it("states improvement in percentage points", () => {
    expect(improvementText(0.42, 0.58)).toBe("+16 نقطة");
    expect(improvementText(0.3, 0.304)).toBe("+أقل من نقطة");
  });
});
