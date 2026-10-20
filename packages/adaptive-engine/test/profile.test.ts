import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  aggregateSkill,
  MASTERY_CONFIG_V1 as config,
  gapSeverity,
  type MasteryState,
  type NodeSettings,
  rankGaps,
} from "../src/index.js";

/**
 * ADAPTIVE_ENGINE.md §14–15 and the skill-profile defaults of OPEN_QUESTIONS.md
 * #12c. Expected values are worked out by hand: e.g. mastery 0.6 under the
 * default threshold 0.85 → severity (0.85 − 0.6) / 0.85 = 0.294118.
 */

const settings: NodeSettings = { masteryThreshold: null, minCoverage: 5 };
const THRESHOLD = config.states.defaultMasteryThreshold;

function node(
  overrides: Partial<{
    masteryScore: number;
    confidenceScore: number;
    evidenceCount: number;
    distinctQuestionCount: number;
    coverageScore: number;
    state: MasteryState;
  }> = {},
) {
  return {
    alpha: 2,
    beta: 2,
    masteryScore: 0.6,
    confidenceScore: 0.6,
    evidenceCount: 4,
    distinctQuestionCount: 4,
    coverageScore: 0.8,
    state: "GAP" as MasteryState,
    ...overrides,
  };
}

describe("gap severity (§15)", () => {
  it("is the shortfall below the threshold, as a share of it", () => {
    expect(gapSeverity(node(), THRESHOLD, config)).toBeCloseTo(0.294118, 6);
  });

  it.each([
    ["never measured", node({ evidenceCount: 0, state: "UNASSESSED" })],
    ["measured with too little confidence", node({ confidenceScore: 0.5, state: "UNCERTAIN" })],
    ["at the threshold", node({ masteryScore: THRESHOLD, state: "DEVELOPING" })],
    ["mastered", node({ masteryScore: 0.6, state: "MASTERED" })],
  ])("is not a gap when %s", (_name, value) => {
    expect(gapSeverity(value, THRESHOLD, config)).toBeNull();
  });

  it("counts a developing node below the threshold as a gap (§15 uses the threshold)", () => {
    expect(
      gapSeverity(node({ masteryScore: 0.8, state: "DEVELOPING" }), THRESHOLD, config),
    ).toBeCloseTo(0.058824, 6);
  });

  it("stays in (0, 1] for any gap", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: THRESHOLD, maxExcluded: true, noNaN: true }),
        fc.double({ min: config.states.minConfidence, max: 0.999, noNaN: true }),
        (masteryScore, confidenceScore) => {
          const severity = gapSeverity(node({ masteryScore, confidenceScore }), THRESHOLD, config);
          expect(severity).not.toBeNull();
          expect(severity).toBeGreaterThan(0);
          expect(severity).toBeLessThanOrEqual(1);
        },
      ),
    );
  });
});

describe("a skill made of subskills (§14, #12c)", () => {
  it("is unassessed while no subskill has evidence", () => {
    const skill = aggregateSkill(
      [
        { node: node({ evidenceCount: 0, coverageScore: 0, state: "UNASSESSED" }), weight: 1 },
        { node: node({ evidenceCount: 0, coverageScore: 0, state: "UNASSESSED" }), weight: 1 },
      ],
      settings,
      config,
    );
    expect(skill).toMatchObject({ state: "UNASSESSED", evidenceCount: 0, coverageScore: 0 });
  });

  it("takes mastery and confidence from measured subskills, coverage from all", () => {
    const skill = aggregateSkill(
      [
        {
          node: node({
            masteryScore: 0.8,
            confidenceScore: 0.7,
            coverageScore: 1,
            evidenceCount: 5,
          }),
          weight: 2,
        },
        { node: node({ evidenceCount: 0, coverageScore: 0, state: "UNASSESSED" }), weight: 1 },
      ],
      settings,
      config,
    );
    expect(skill.masteryScore).toBeCloseTo(0.8, 6);
    expect(skill.confidenceScore).toBeCloseTo(0.7, 6);
    // (1 × 2 + 0 × 1) / 3
    expect(skill.coverageScore).toBeCloseTo(0.666667, 6);
    expect(skill.evidenceCount).toBe(5);
    // 0.8 is at least gapMasteryBelow (0.7) but under the threshold (0.85).
    expect(skill.state).toBe("DEVELOPING");
  });

  it("weights subskills by their weight", () => {
    const skill = aggregateSkill(
      [
        { node: node({ masteryScore: 0.9, confidenceScore: 0.8 }), weight: 3 },
        { node: node({ masteryScore: 0.5, confidenceScore: 0.6 }), weight: 1 },
      ],
      settings,
      config,
    );
    // (0.9 × 3 + 0.5 × 1) / 4 and (0.8 × 3 + 0.6 × 1) / 4
    expect(skill.masteryScore).toBeCloseTo(0.8, 6);
    expect(skill.confidenceScore).toBeCloseTo(0.75, 6);
  });

  it("is mastered only when every subskill is", () => {
    const mastered = node({
      masteryScore: 0.95,
      confidenceScore: 0.9,
      coverageScore: 1,
      state: "MASTERED",
    });
    expect(
      aggregateSkill(
        [
          { node: mastered, weight: 1 },
          { node: mastered, weight: 1 },
        ],
        settings,
        config,
      ).state,
    ).toBe("MASTERED");
    expect(
      aggregateSkill(
        [
          { node: mastered, weight: 1 },
          { node: { ...mastered, state: "READY_FOR_REASSESSMENT" as MasteryState }, weight: 1 },
        ],
        settings,
        config,
      ).state,
    ).toBe("READY_FOR_REASSESSMENT");
  });
});

describe("gap ranking", () => {
  it("puts the largest gap first and keeps display order for ties", () => {
    const ranked = rankGaps([
      { id: "a", severity: 0.2, order: 1 },
      { id: "b", severity: 0.5, order: 3 },
      { id: "c", severity: 0.5, order: 2 },
    ]);
    expect(ranked.map((gap) => gap.id)).toEqual(["c", "b", "a"]);
  });
});
