import { afterEach, describe, expect, it, vi } from "vitest";

import { getSkillProfile, type MasteryState } from "../src/lib/api";
import { coverageText, MASTERY_STATE_LABELS } from "../src/lib/mastery-labels";

afterEach(() => vi.unstubAllGlobals());

describe("skill profile", () => {
  it("reads the signed-in student's own profile, with no student id in the request", async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ domains: [], gaps: [] }));
    vi.stubGlobal("fetch", request);
    await getSkillProfile("e1");
    expect(request).toHaveBeenCalledWith(
      "/api/v1/exams/e1/skill-profile",
      expect.objectContaining({ method: "GET", credentials: "same-origin" }),
    );
  });

  it("names every mastery state in Arabic", () => {
    const states: MasteryState[] = [
      "UNASSESSED",
      "UNCERTAIN",
      "GAP",
      "DEVELOPING",
      "READY_FOR_REASSESSMENT",
      "MASTERED",
    ];
    for (const state of states) expect(MASTERY_STATE_LABELS[state]).toMatch(/[؀-ۿ]/);
    expect(new Set(states.map((state) => MASTERY_STATE_LABELS[state])).size).toBe(states.length);
  });

  it("describes coverage in words", () => {
    expect(coverageText(0)).toBe("لم تُغطَّ بعد");
    expect(coverageText(0.6667)).toBe("مغطاة 67٪");
    expect(coverageText(1)).toBe("مغطاة بالكامل");
  });
});
