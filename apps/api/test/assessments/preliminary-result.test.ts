import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { PRELIMINARY_RESULT_DEFAULTS } from "../../src/modules/assessments/domain/assessment-config.js";
import {
  type ItemOutcome,
  levelFor,
  type MeasuredItem,
  type PreliminaryResultConfig,
  summarizePreliminaryResult,
} from "../../src/modules/assessments/domain/preliminary-result.js";

const config = PRELIMINARY_RESULT_DEFAULTS;

/** `items("reading", "CCI")`: three questions on one skill — Correct, Correct, Incorrect. */
function items(skillId: string, outcomes: string): MeasuredItem[] {
  const byLetter: Record<string, ItemOutcome> = {
    C: "CORRECT",
    I: "INCORRECT",
    S: "NOT_ANSWERED",
  };
  return [...outcomes].map((letter) => {
    const outcome = byLetter[letter];
    if (!outcome) throw new Error(`unknown outcome ${letter}`);
    return { skillId, outcome };
  });
}

const summarize = (measured: MeasuredItem[], overrides: Partial<PreliminaryResultConfig> = {}) =>
  summarizePreliminaryResult(measured, { ...config, ...overrides });

describe("score", () => {
  it("counts correct answers against every question in the diagnostic", () => {
    const result = summarize([...items("a", "CCCCCCCCCCCCCCC"), ...items("b", "IIIII")]);
    expect(result.score).toEqual({ correct: 15, total: 20, percentage: 75 });
  });

  it("counts a skipped question as not correct", () => {
    expect(summarize(items("a", "CSSS")).score).toEqual({ correct: 1, total: 4, percentage: 25 });
  });

  it("rounds the percentage to a whole number", () => {
    expect(summarize(items("a", "CII")).score.percentage).toBe(33);
    expect(summarize(items("a", "CCI")).score.percentage).toBe(67);
  });
});

describe("diagnostic level", () => {
  it.each([
    [0, "NEEDS_FOUNDATION"],
    [39, "NEEDS_FOUNDATION"],
    [40, "BEGINNER"],
    [54, "BEGINNER"],
    [55, "INTERMEDIATE"],
    [69, "INTERMEDIATE"],
    [70, "GOOD"],
    [84, "GOOD"],
    [85, "ADVANCED"],
    [100, "ADVANCED"],
  ] as const)("%i%% is %s by default", (percentage, level) => {
    expect(levelFor(percentage, config.levels)).toBe(level);
  });

  it("follows the performance percentage, not the number of correct answers", () => {
    // Six correct answers each time; only the share of the diagnostic differs.
    expect(summarize(items("a", "CCCCCC")).level).toBe("ADVANCED");
    expect(summarize(items("a", "CCCCCCIIIIII")).level).toBe("BEGINNER");
  });

  it("is decided by the percentage the student is shown", () => {
    // 6 of 11 is 54.5%, shown as 55%: the level must be the one 55% earns.
    const result = summarize(items("a", "CCCCCCIIIII"));
    expect(result.score.percentage).toBe(55);
    expect(result.level).toBe("INTERMEDIATE");
  });

  it("uses whatever bands it is given", () => {
    const levels = [
      { level: "NEEDS_FOUNDATION", fromPercentage: 0 },
      { level: "ADVANCED", fromPercentage: 50 },
    ] as const;
    expect(summarize(items("a", "CI"), { levels }).level).toBe("ADVANCED");
    expect(summarize(items("a", "CII"), { levels }).level).toBe("NEEDS_FOUNDATION");
  });

  it("refuses bands that leave low scores without a level", () => {
    expect(() => levelFor(10, [{ level: "ADVANCED", fromPercentage: 50 }])).toThrow(
      /must start at 0/,
    );
  });

  it("ships default bands that start at 0 and rise through all five levels", () => {
    const starts = config.levels.map((b) => b.fromPercentage);
    expect(starts[0]).toBe(0);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(new Set(starts).size).toBe(starts.length);
    expect(config.levels.map((b) => b.level)).toEqual([
      "NEEDS_FOUNDATION",
      "BEGINNER",
      "INTERMEDIATE",
      "GOOD",
      "ADVANCED",
    ]);
  });
});

describe("strengths", () => {
  it("shows the two strongest skills only, best first", () => {
    const result = summarize([
      ...items("good", "CCCI"), // 75%
      ...items("perfect", "CC"), // 100%
      ...items("also-good", "CCCCI"), // 80%
      ...items("weak", "II"),
    ]);
    expect(result.strengths).toEqual([
      { skillId: "perfect", rating: "VERY_GOOD" },
      { skillId: "also-good", rating: "GOOD" },
    ]);
  });

  it("rates 85% and above very good, 70% and above good", () => {
    const result = summarize([
      ...items("a", "CCCCCCCCCCCCCCCCCIII"), // 17 of 20 = 85%
      ...items("b", "CCCCCCCIII"), // 7 of 10 = 70%
    ]);
    expect(result.strengths).toEqual([
      { skillId: "a", rating: "VERY_GOOD" },
      { skillId: "b", rating: "GOOD" },
    ]);
  });

  it("prefers the skill with more correct answers when accuracy ties", () => {
    const result = summarize([...items("one", "C"), ...items("three", "CCC")], {
      maxStrengths: 1,
    });
    expect(result.strengths).toEqual([{ skillId: "three", rating: "VERY_GOOD" }]);
  });
});

describe("weaknesses", () => {
  it("shows the three weakest skills only, most in need of training first", () => {
    const result = summarize([
      ...items("half", "CI"), // 50%
      ...items("none", "II"), // 0%
      ...items("third", "CII"), // 33%
      ...items("two-thirds", "CCI"), // 67%
      ...items("strong", "CC"),
    ]);
    expect(result.weaknesses).toEqual([
      { skillId: "none", rating: "NEEDS_TRAINING" },
      { skillId: "third", rating: "NEEDS_TRAINING" },
      { skillId: "half", rating: "NEEDS_TRAINING" },
    ]);
  });

  it("puts the skill with more wrong answers first when accuracy ties", () => {
    const result = summarize([...items("one-wrong", "I"), ...items("three-wrong", "III")]);
    expect(result.weaknesses.map((w) => w.skillId)).toEqual(["three-wrong", "one-wrong"]);
  });

  it("keeps the order of the diagnostic when skills tie completely", () => {
    const result = summarize([...items("first", "I"), ...items("second", "I")]);
    expect(result.weaknesses.map((w) => w.skillId)).toEqual(["first", "second"]);
  });
});

describe("only what was measured", () => {
  it("shows fewer points when fewer skills were measured, never padding", () => {
    const result = summarize([...items("only", "CC")]);
    expect(result.strengths).toEqual([{ skillId: "only", rating: "VERY_GOOD" }]);
    expect(result.weaknesses).toEqual([]);
  });

  it("does not report a skill whose questions were all skipped", () => {
    const result = summarize([...items("skipped", "SS"), ...items("answered", "I")]);
    expect(result.weaknesses).toEqual([{ skillId: "answered", rating: "NEEDS_TRAINING" }]);
    expect(result.strengths).toEqual([]);
  });

  it("judges a skill on the questions answered, ignoring its skips", () => {
    const result = summarize(items("a", "CS"));
    expect(result.strengths).toEqual([{ skillId: "a", rating: "VERY_GOOD" }]);
  });

  it("reports nothing for a diagnostic skipped from start to finish", () => {
    expect(summarize(items("a", "SSS"))).toEqual({
      score: { correct: 0, total: 3, percentage: 0 },
      level: "NEEDS_FOUNDATION",
      strengths: [],
      weaknesses: [],
    });
  });
});

describe("properties", () => {
  const measuredItems = fc.array(
    fc.record({
      skillId: fc.constantFrom("s1", "s2", "s3", "s4", "s5", "s6", "s7"),
      outcome: fc.constantFrom<ItemOutcome>("CORRECT", "INCORRECT", "NOT_ANSWERED"),
    }),
    { maxLength: 40 },
  );

  it("never exceeds the limits, never names a skill twice or one that was not answered", () => {
    fc.assert(
      fc.property(measuredItems, (measured) => {
        const result = summarize(measured);
        const answered = new Set<string>(
          measured.filter((i) => i.outcome !== "NOT_ANSWERED").map((i) => i.skillId),
        );
        const shown = [...result.strengths, ...result.weaknesses].map((s) => s.skillId);

        expect(result.strengths.length).toBeLessThanOrEqual(config.maxStrengths);
        expect(result.weaknesses.length).toBeLessThanOrEqual(config.maxWeaknesses);
        expect(new Set(shown).size).toBe(shown.length);
        for (const skillId of shown) expect(answered.has(skillId)).toBe(true);
        expect(result.score.percentage).toBeGreaterThanOrEqual(0);
        expect(result.score.percentage).toBeLessThanOrEqual(100);
      }),
    );
  });

  it("does not depend on anything but its input", () => {
    fc.assert(
      fc.property(measuredItems, (measured) => {
        expect(summarize(measured)).toEqual(summarize(measured));
      }),
    );
  });
});
