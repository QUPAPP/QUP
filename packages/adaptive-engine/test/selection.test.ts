import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  chooseTarget,
  SELECTION_CONFIG_V1 as config,
  examWeightFactors,
  gapPriority,
  pickCandidate,
  prerequisiteBoost,
  rankCandidates,
  type SelectionCandidate,
  type TargetSkill,
  targetDifficulty,
} from "../src/index.js";

/**
 * ADAPTIVE_ENGINE.md §16–§20 and the training defaults of OPEN_QUESTIONS.md
 * #12d. Expected numbers are worked out by hand in each test.
 */

function skill(id: string, overrides: Partial<TargetSkill> = {}): TargetSkill {
  return {
    id,
    order: 0,
    state: "GAP",
    severity: 0.3,
    examWeightFactor: 1,
    priorityWeight: 1,
    prerequisiteIds: [],
    hasCandidates: true,
    ...overrides,
  };
}

function candidate(id: string, overrides: Partial<SelectionCandidate> = {}): SelectionCandidate {
  return {
    questionVersionId: id,
    difficulty: 0.5,
    nodeSeverity: null,
    nodeMeasured: true,
    nodeCoverage: 1,
    ...overrides,
  };
}

describe("gap priority (§16)", () => {
  it("multiplies severity by the exam weight, priority weight and prerequisite boost", () => {
    expect(
      gapPriority({
        severity: 0.5,
        examWeightFactor: 1.5,
        priorityWeight: 2,
        prerequisiteBoost: 1.2,
      }),
    ).toBeCloseTo(1.8, 10);
  });

  it("normalises exam weights so the average skill factor is 1", () => {
    // Domain weights 1 and 3; skills weighted 1 and 1 in the first, 2 alone in the second.
    const factors = examWeightFactors([
      {
        weight: 1,
        skills: [
          { id: "a", weight: 1 },
          { id: "b", weight: 1 },
        ],
      },
      { weight: 3, skills: [{ id: "c", weight: 2 }] },
    ]);
    // Shares 0.125, 0.125, 0.75 of the exam; three skills → × 3.
    expect(factors.get("a")).toBeCloseTo(0.375, 10);
    expect(factors.get("b")).toBeCloseTo(0.375, 10);
    expect(factors.get("c")).toBeCloseTo(2.25, 10);
    const mean = [...factors.values()].reduce((sum, f) => sum + f, 0) / factors.size;
    expect(mean).toBeCloseTo(1, 10);
  });

  it("boosts a prerequisite of other gaps, up to a cap", () => {
    expect(prerequisiteBoost(0, config)).toBe(1);
    expect(prerequisiteBoost(2, config)).toBeCloseTo(1.4, 10);
    expect(prerequisiteBoost(10, config)).toBe(1.6);
  });
});

describe("target choice (§15, §20, WORKFLOWS §4)", () => {
  it("takes the gap with the highest priority", () => {
    const choice = chooseTarget(
      {
        skills: [
          skill("small", { severity: 0.2, order: 0 }),
          skill("large", { severity: 0.4, order: 1 }),
          skill("weighted", { severity: 0.2, examWeightFactor: 3, order: 2 }),
        ],
        current: null,
      },
      config,
    );
    // 0.2, 0.4 and 0.6.
    expect(choice).toMatchObject({ skillId: "weighted", reason: "TOP_GAP" });
    expect(choice?.priority).toBeCloseTo(0.6, 10);
  });

  it("boosts a gap that other gaps depend on", () => {
    const choice = chooseTarget(
      {
        skills: [
          skill("base", { severity: 0.3, order: 0 }),
          skill("dependent", { severity: 0.35, prerequisiteIds: ["base"], order: 1 }),
        ],
        current: null,
      },
      config,
    );
    // base: 0.3 × 1.2 = 0.36 beats 0.35.
    expect(choice).toMatchObject({ skillId: "base", reason: "TOP_GAP" });
  });

  it("stays on the session's target while it is still trainable", () => {
    const choice = chooseTarget(
      {
        skills: [skill("current", { severity: 0.1 }), skill("bigger", { severity: 0.9 })],
        current: { skillId: "current", recentResults: [false] },
      },
      config,
    );
    expect(choice).toMatchObject({ skillId: "current", reason: "CONTINUE_TARGET" });
  });

  it("moves on once the target is no longer trainable", () => {
    const choice = chooseTarget(
      {
        skills: [
          skill("current", { severity: null, state: "READY_FOR_REASSESSMENT" }),
          skill("next", { severity: 0.2 }),
        ],
        current: { skillId: "current", recentResults: [true, true] },
      },
      config,
    );
    expect(choice).toMatchObject({ skillId: "next", reason: "TOP_GAP" });
  });

  it("checks a trainable prerequisite after three wrong answers in a row", () => {
    const skills = [
      skill("current", { prerequisiteIds: ["mastered", "basis"] }),
      skill("mastered", { severity: null, state: "MASTERED" }),
      skill("basis", { severity: null, state: "UNASSESSED" }),
    ];
    expect(
      chooseTarget(
        { skills, current: { skillId: "current", recentResults: [false, false] } },
        config,
      ),
    ).toMatchObject({ skillId: "current", reason: "CONTINUE_TARGET" });
    expect(
      chooseTarget(
        { skills, current: { skillId: "current", recentResults: [true, false, false, false] } },
        config,
      ),
    ).toMatchObject({ skillId: "basis", reason: "PREREQUISITE_CHECK" });
  });

  it("falls back to the skill most in need of evidence when there is no gap", () => {
    const choice = chooseTarget(
      {
        skills: [
          skill("ready", { severity: null, state: "READY_FOR_REASSESSMENT" }),
          skill("light", { severity: null, state: "UNASSESSED", examWeightFactor: 0.5, order: 1 }),
          skill("heavy", { severity: null, state: "UNCERTAIN", examWeightFactor: 1.5, order: 2 }),
        ],
        current: null,
      },
      config,
    );
    expect(choice).toMatchObject({ skillId: "heavy", reason: "NEEDS_MEASUREMENT", priority: null });
  });

  it("skips skills with no question left, and returns null when nothing is trainable", () => {
    expect(
      chooseTarget(
        {
          skills: [
            skill("empty", { severity: 0.9, hasCandidates: false }),
            skill("open", { severity: 0.1 }),
          ],
          current: { skillId: "empty", recentResults: [] },
        },
        config,
      ),
    ).toMatchObject({ skillId: "open", reason: "TOP_GAP" });
    expect(
      chooseTarget(
        {
          skills: [
            skill("mastered", { severity: null, state: "MASTERED" }),
            skill("empty", { hasCandidates: false }),
          ],
          current: null,
        },
        config,
      ),
    ).toBeNull();
  });
});

describe("target difficulty (§17)", () => {
  it.each([
    ["no recent answers", 0.6, [], 0.6, []],
    ["one wrong: a nearby level", 0.6, [false], 0.6, []],
    ["two correct", 0.6, [false, true, true], 0.65, ["RECENT_CORRECT_UP"]],
    ["two wrong", 0.6, [true, false, false], 0.5, ["RECENT_WRONG_DOWN"]],
    ["clamped low", 0.15, [false, false], 0.2, ["RECENT_WRONG_DOWN"]],
    ["clamped high", 0.95, [], 0.9, []],
    ["unmeasured starts at the middle", null, [], 0.5, []],
  ] as const)("%s", (_name, mastery, recent, expected, reasons) => {
    const result = targetDifficulty(mastery, recent, config);
    expect(result.value).toBeCloseTo(expected, 10);
    expect(result.reasons).toEqual(reasons);
  });

  it("always stays within [0.20, 0.90]", () => {
    fc.assert(
      fc.property(
        fc.option(fc.double({ min: 0, max: 1, noNaN: true }), { nil: null }),
        fc.array(fc.boolean(), { maxLength: 6 }),
        (mastery, recent) => {
          const { value } = targetDifficulty(mastery, recent, config);
          expect(value).toBeGreaterThanOrEqual(0.2);
          expect(value).toBeLessThanOrEqual(0.9);
        },
      ),
    );
  });
});

describe("candidates (§18–§19)", () => {
  it("keeps candidates within the difficulty band and scores them", () => {
    const { scored, widened } = rankCandidates(
      [
        candidate("near", { difficulty: 0.55 }),
        candidate("exact", { difficulty: 0.5 }),
        candidate("far", { difficulty: 0.9 }),
      ],
      0.5,
      config,
    );
    expect(widened).toBe(false);
    expect(scored.map((c) => c.questionVersionId)).toEqual(["exact", "near"]);
    // exact: 0.40 × 1 + 0.25 × 0 + 0.15 + 0.10 + 0.10 × 0 = 0.65
    expect(scored[0]?.score).toBeCloseTo(0.65, 10);
  });

  it("prefers a question on a weaker, less covered node", () => {
    const { scored } = rankCandidates(
      [
        candidate("covered"),
        candidate("gap", { nodeSeverity: 0.4, nodeCoverage: 0.5 }),
        candidate("unmeasured", { nodeMeasured: false, nodeCoverage: 0 }),
      ],
      0.5,
      config,
    );
    // unmeasured: 0.65 + 0.25 + 0.10 = 1.00; gap: 0.65 + 0.10 + 0.05 = 0.80.
    expect(scored.map((c) => c.questionVersionId)).toEqual(["unmeasured", "gap", "covered"]);
  });

  it("widens the band when nothing fits, rather than giving up", () => {
    const { scored, widened } = rankCandidates(
      [candidate("hard", { difficulty: 0.95 })],
      0.3,
      config,
    );
    expect(widened).toBe(true);
    expect(scored.map((c) => c.questionVersionId)).toEqual(["hard"]);
  });

  it("picks among the top three with weighted randomness, reproducibly", () => {
    const { scored } = rankCandidates(
      ["a", "b", "c", "d"].map((id, i) => candidate(id, { difficulty: 0.5 + i * 0.01 })),
      0.5,
      config,
    );
    expect(pickCandidate(scored, () => 0, config)?.questionVersionId).toBe("a");
    expect(pickCandidate(scored, () => 0.999, config)?.questionVersionId).toBe("c");
    expect(pickCandidate([], () => 0.5, config)).toBeNull();
  });

  it("always picks one of the top three", () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 1, maxLength: 12 }),
        fc.double({ min: 0, max: 0.999999, noNaN: true }),
        (difficulties, r) => {
          const { scored } = rankCandidates(
            difficulties.map((d, i) => candidate(`q${i}`, { difficulty: d })),
            0.5,
            config,
          );
          const picked = pickCandidate(scored, () => r, config);
          const top = scored.slice(0, config.topN).map((c) => c.questionVersionId);
          expect(top).toContain(picked?.questionVersionId);
        },
      ),
    );
  });
});
