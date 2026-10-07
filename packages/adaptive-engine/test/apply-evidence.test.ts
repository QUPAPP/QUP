import { describe, expect, it } from "vitest";

import {
  applyEvidence,
  MASTERY_CONFIG_V1 as config,
  type EligibleAttempt,
  initialNodeMastery,
  type LearningNodeMapping,
  type NodeMastery,
  type NodeSettings,
  parentMastery,
  repeatFactor,
} from "../src/index.js";

/**
 * TESTING.md "Mastery Engine Cases". Expected values are worked out by hand
 * from the formulas in ADAPTIVE_ENGINE.md, independently of the code — e.g.
 * correct at difficulty 0.25: positive = 0.75 + 0.75 × 0.25 = 0.9375, so
 * mastery = (2 + 0.9375) / (4 + 0.9375) = 0.594937.
 */

const NOW = new Date("2026-09-28T12:00:00Z");
const DAY_MS = 86_400_000;
const settings: NodeSettings = { masteryThreshold: null, minCoverage: 5 };
const primary: LearningNodeMapping = { role: "PRIMARY", attributionWeight: 1 };
const secondary: LearningNodeMapping = { role: "SECONDARY", attributionWeight: 0.35 };

function attempt(overrides: Partial<EligibleAttempt> = {}): EligibleAttempt {
  return {
    attemptId: "attempt-1",
    questionId: "question-1",
    result: { kind: "ANSWERED", isCorrect: true, hintUsed: false, answerRevealed: false },
    difficulty: 0.5,
    answeredAt: NOW,
    previousAttemptAt: null,
    ...overrides,
  };
}

const answered = (
  isCorrect: boolean,
  extra: { hintUsed?: boolean; answerRevealed?: boolean } = {},
) =>
  ({
    kind: "ANSWERED",
    isCorrect,
    hintUsed: extra.hintUsed ?? false,
    answerRevealed: extra.answerRevealed ?? false,
  }) as const;

function apply(a: EligibleAttempt, mapping = primary, prior = initialNodeMastery(config)) {
  return applyEvidence({ prior, settings, attempt: a, mapping, config });
}

describe("evidence by difficulty (§5, §6)", () => {
  it.each([
    ["correct, easy", answered(true), 0.25, { positive: 0.9375, negative: 0, mastery: 0.594937 }],
    ["correct, hard", answered(true), 0.75, { positive: 1.3125, negative: 0, mastery: 0.623529 }],
    ["wrong, easy", answered(false), 0.25, { positive: 0, negative: 1.3125, mastery: 0.376471 }],
    ["wrong, hard", answered(false), 0.75, { positive: 0, negative: 0.9375, mastery: 0.405063 }],
  ] as const)("%s", (_label, result, difficulty, expected) => {
    const { next, event } = apply(attempt({ result, difficulty }));

    expect(event?.positiveEvidence).toBeCloseTo(expected.positive, 6);
    expect(event?.negativeEvidence).toBeCloseTo(expected.negative, 6);
    expect(next.masteryScore).toBeCloseTo(expected.mastery, 6);
  });

  it("weighs a correct hard answer above a correct easy one, and a wrong easy one above a wrong hard one", () => {
    const easyRight = apply(attempt({ difficulty: 0.25 })).next.masteryScore;
    const hardRight = apply(attempt({ difficulty: 0.75 })).next.masteryScore;
    const easyWrong = apply(attempt({ result: answered(false), difficulty: 0.25 })).next
      .masteryScore;
    const hardWrong = apply(attempt({ result: answered(false), difficulty: 0.75 })).next
      .masteryScore;

    expect(hardRight).toBeGreaterThan(easyRight);
    expect(easyWrong).toBeLessThan(hardWrong);
  });
});

describe("confidence (§3)", () => {
  it("follows 1 − exp(−E / 8)", () => {
    // E = 0.9375 → 1 − exp(−0.1171875) = 1 − 0.8894184 = 0.110582
    expect(apply(attempt({ difficulty: 0.25 })).next.confidenceScore).toBeCloseTo(0.110582, 6);
  });
});

describe("hints and reveals (§8)", () => {
  it("scales positive evidence by 0.6 when a hint was used", () => {
    const { event } = apply(attempt({ result: answered(true, { hintUsed: true }) }));
    expect(event?.positiveEvidence).toBeCloseTo(1.125 * 0.6, 6);
    expect(event?.reasonCode).toBe("CORRECT_WITH_HINT");
  });

  it("gives no evidence — and no event — for a correct answer after the answer was revealed", () => {
    const prior = initialNodeMastery(config);
    const { next, event } = apply(
      attempt({ result: answered(true, { answerRevealed: true }) }),
      primary,
      prior,
    );
    expect(event).toBeNull();
    expect(next).toBe(prior);
  });

  it("does not soften a wrong answer because a hint was used", () => {
    const plain = apply(attempt({ result: answered(false) })).event?.negativeEvidence;
    const hinted = apply(attempt({ result: answered(false, { hintUsed: true }) })).event
      ?.negativeEvidence;
    expect(hinted).toBe(plain);
  });
});

describe("timeout and skip (§10)", () => {
  it("halves negative evidence on timeout", () => {
    const { event } = apply(attempt({ result: { kind: "TIMEOUT" } }));
    expect(event?.negativeEvidence).toBeCloseTo((1.5 - 0.375) * 0.5, 6);
    expect(event?.reasonCode).toBe("TIMEOUT");
  });

  it("produces no evidence and no event for a skip", () => {
    const prior = initialNodeMastery(config);
    const { next, event } = apply(attempt({ result: { kind: "SKIPPED" } }), primary, prior);
    expect(event).toBeNull();
    expect(next).toBe(prior);
  });
});

describe("repeat factor (§9)", () => {
  const seenDaysAgo = (days: number) =>
    attempt({ previousAttemptAt: new Date(NOW.getTime() - days * DAY_MS) });

  it.each([
    ["first time", null, 1],
    ["3 days later", 3, 0.35],
    ["exactly 7 days later", 7, 0.35],
    ["8 days later", 8, 0.7],
    ["30 days later", 30, 0.7],
    ["31 days later", 31, 1],
  ] as const)("%s → %s", (_label, days, factor) => {
    expect(repeatFactor(days === null ? attempt() : seenDaysAgo(days), config)).toBe(factor);
  });

  it("counts a repeated question once towards distinct questions", () => {
    const first = apply(attempt());
    const again = apply(seenDaysAgo(2), primary, first.next);
    expect(again.next.distinctQuestionCount).toBe(1);
    expect(again.next.evidenceCount).toBe(2);
  });
});

describe("attribution (§7)", () => {
  it("applies 0.35 of the evidence to a SECONDARY node", () => {
    const { event } = apply(attempt(), secondary);
    expect(event?.positiveEvidence).toBeCloseTo(1.125 * 0.35, 6);
    expect(event?.attributionWeight).toBe(0.35);
  });
});

describe("states (§12)", () => {
  function answerMany(count: number, isCorrect: boolean, difficulty: number, prior?: NodeMastery) {
    let node = prior ?? initialNodeMastery(config);
    for (let i = 0; i < count; i++) {
      node = apply(
        attempt({
          attemptId: `a-${i}`,
          questionId: `q-${i}`,
          result: answered(isCorrect),
          difficulty,
        }),
        primary,
        node,
      ).next;
    }
    return node;
  }

  it("cannot reach mastery on little evidence, however good", () => {
    // One perfect answer: mastery 0.63 but confidence 0.16 → UNCERTAIN.
    expect(answerMany(1, true, 0.9).state).toBe("UNCERTAIN");
  });

  it("names a GAP once there is enough evidence of weakness", () => {
    // Six wrong at 0.5: E = 6.75 → confidence 0.570 ≥ 0.55; mastery 0.186 < 0.70.
    expect(answerMany(5, false, 0.5).state).toBe("UNCERTAIN");
    expect(answerMany(6, false, 0.5).state).toBe("GAP");
  });

  it("becomes READY_FOR_REASSESSMENT with mastery, confidence and coverage — never MASTERED", () => {
    // Eight correct at 0.9: E = 11.4 → confidence 0.759, mastery 0.870, 8 distinct ≥ 5.
    const node = answerMany(8, true, 0.9);
    expect(node.masteryScore).toBeCloseTo(0.87013, 4);
    expect(node.state).toBe("READY_FOR_REASSESSMENT");
  });

  it("stays DEVELOPING while coverage is short, whatever the score", () => {
    const narrow = { masteryThreshold: null, minCoverage: 100 };
    let node = initialNodeMastery(config);
    for (let i = 0; i < 8; i++) {
      node = applyEvidence({
        prior: node,
        settings: narrow,
        attempt: attempt({ attemptId: `a-${i}`, questionId: `q-${i}`, difficulty: 0.9 }),
        mapping: primary,
        config,
      }).next;
    }
    expect(node.state).toBe("DEVELOPING");
  });

  it("never lets evidence change a MASTERED node's state (OPEN_QUESTIONS.md #12a)", () => {
    const mastered: NodeMastery = {
      ...initialNodeMastery(config),
      evidenceCount: 10,
      state: "MASTERED",
    };
    expect(answerMany(3, false, 0.5, mastered).state).toBe("MASTERED");
  });
});

describe("event", () => {
  it("records versions and the before/after values, for replay (§22, §24)", () => {
    const { next, event } = apply(attempt());
    expect(event).toMatchObject({
      attemptId: "attempt-1",
      beforeMastery: 0.5,
      afterMastery: next.masteryScore,
      beforeConfidence: 0,
      algorithmVersion: "mastery-v1.0",
      configVersion: "mastery-config-v1.0",
    });
  });
});

describe("parent mastery (§14)", () => {
  it("is the weighted average of subskills that have evidence", () => {
    expect(
      parentMastery([
        { masteryScore: 0.9, evidenceCount: 4, weight: 1 },
        { masteryScore: 0.3, evidenceCount: 2, weight: 3 },
        { masteryScore: 0.0, evidenceCount: 0, weight: 5 }, // unmeasured: ignored
      ]),
    ).toBeCloseTo((0.9 + 0.3 * 3) / 4, 10);
  });

  it("is unknown when no subskill has evidence", () => {
    expect(parentMastery([{ masteryScore: 0.5, evidenceCount: 0, weight: 1 }])).toBeNull();
  });
});
