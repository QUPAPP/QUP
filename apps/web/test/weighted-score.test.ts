import { describe, expect, it } from "vitest";

import { parseScore, WEIGHT_PRESETS, weightedScore } from "../src/lib/weighted-score";

const common = { highSchool: 30, aptitude: 30, achievement: 40 };

describe("weightedScore", () => {
  it("weighs each score and adds the parts", () => {
    expect(weightedScore({ highSchool: 95, aptitude: 80, achievement: 85 }, common)).toEqual({
      ok: true,
      score: 86.5,
      parts: { highSchool: 28.5, aptitude: 24, achievement: 34 },
    });
  });

  it("needs no score for a part weighted zero", () => {
    const result = weightedScore(
      { highSchool: 90, aptitude: 70, achievement: null },
      { highSchool: 50, aptitude: 50, achievement: 0 },
    );
    expect(result).toMatchObject({ ok: true, score: 80 });
  });

  it("refuses weights that do not add up to 100, missing and impossible scores", () => {
    expect(
      weightedScore(
        { highSchool: 90, aptitude: 70, achievement: 80 },
        { ...common, achievement: 30 },
      ),
    ).toEqual({
      ok: false,
      problem: "WEIGHTS_NOT_100",
    });
    expect(weightedScore({ highSchool: 90, aptitude: null, achievement: 80 }, common)).toEqual({
      ok: false,
      problem: "MISSING_SCORE",
    });
    expect(weightedScore({ highSchool: 101, aptitude: 70, achievement: 80 }, common)).toEqual({
      ok: false,
      problem: "OUT_OF_RANGE",
    });
  });

  it("offers presets that each add up to 100", () => {
    for (const preset of WEIGHT_PRESETS) {
      const { highSchool, aptitude, achievement } = preset.weights;
      expect(highSchool + aptitude + achievement).toBe(100);
    }
  });
});

describe("parseScore", () => {
  it.each([
    ["", null],
    ["  ", null],
    ["abc", null],
    ["87.5", 87.5],
    ["٩٥", 95],
    ["٨٧٫٥", 87.5],
  ])("reads %j", (text, value) => {
    expect(parseScore(text)).toBe(value);
  });
});
