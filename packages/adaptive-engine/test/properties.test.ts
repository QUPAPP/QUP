import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  type AttemptResult,
  applyEvidence,
  MASTERY_CONFIG_V1 as config,
  type EligibleAttempt,
  initialNodeMastery,
  type NodeMastery,
} from "../src/index.js";

/**
 * TESTING.md "Property checks": invariants that must hold for *any* sequence
 * of attempts, not just the hand-picked cases. fast-check generates thousands
 * of sequences and shrinks any failure to a minimal counterexample.
 */

const START = new Date("2026-01-01T00:00:00Z").getTime();
const DAY_MS = 86_400_000;
const settings = { masteryThreshold: null, minCoverage: 5 };

const resultArb: fc.Arbitrary<AttemptResult> = fc.oneof(
  fc.record({
    kind: fc.constant("ANSWERED" as const),
    isCorrect: fc.boolean(),
    hintUsed: fc.boolean(),
    answerRevealed: fc.boolean(),
  }),
  fc.constant({ kind: "SKIPPED" as const }),
  fc.constant({ kind: "TIMEOUT" as const }),
);

const stepArb = fc.record({
  result: resultArb,
  difficulty: fc.double({ min: 0, max: 1, noNaN: true }),
  weight: fc.constantFrom(1, 0.35, 0.5),
  questionId: fc.constantFrom("q1", "q2", "q3", "q4"),
  daysLater: fc.integer({ min: 0, max: 60 }),
});

type Step = typeof stepArb extends fc.Arbitrary<infer T> ? T : never;

/** Replays a sequence, returning every state along the way. */
function replay(steps: readonly Step[]): NodeMastery[] {
  const lastSeen = new Map<string, number>();
  const states = [initialNodeMastery(config)];
  let clock = START;
  steps.forEach((step, index) => {
    clock += step.daysLater * DAY_MS;
    const previous = lastSeen.get(step.questionId);
    const attempt: EligibleAttempt = {
      attemptId: `a-${index}`,
      questionId: step.questionId,
      result: step.result,
      difficulty: step.difficulty,
      answeredAt: new Date(clock),
      previousAttemptAt: previous === undefined ? null : new Date(previous),
    };
    lastSeen.set(step.questionId, clock);
    const prior = states[states.length - 1] as NodeMastery;
    states.push(
      applyEvidence({
        prior,
        settings,
        attempt,
        mapping: {
          role: step.weight === 1 ? "PRIMARY" : "SECONDARY",
          attributionWeight: step.weight,
        },
        config,
      }).next,
    );
  });
  return states;
}

const sequences = fc.array(stepArb, { maxLength: 40 });

describe("mastery engine invariants", () => {
  it("keeps mastery and confidence within [0, 1]", () => {
    fc.assert(
      fc.property(sequences, (steps) => {
        for (const node of replay(steps)) {
          expect(node.masteryScore).toBeGreaterThanOrEqual(0);
          expect(node.masteryScore).toBeLessThanOrEqual(1);
          expect(node.confidenceScore).toBeGreaterThanOrEqual(0);
          expect(node.confidenceScore).toBeLessThanOrEqual(1);
          expect(node.coverageScore).toBeLessThanOrEqual(1);
        }
      }),
    );
  });

  it("never decreases alpha, beta, confidence or evidence count", () => {
    fc.assert(
      fc.property(sequences, (steps) => {
        const states = replay(steps);
        for (let i = 1; i < states.length; i++) {
          const [before, after] = [states[i - 1] as NodeMastery, states[i] as NodeMastery];
          expect(after.alpha).toBeGreaterThanOrEqual(before.alpha);
          expect(after.beta).toBeGreaterThanOrEqual(before.beta);
          expect(after.confidenceScore).toBeGreaterThanOrEqual(before.confidenceScore);
          expect(after.evidenceCount).toBeGreaterThanOrEqual(before.evidenceCount);
        }
      }),
    );
  });

  it("never lowers mastery on a correct answer, never raises it on a wrong one", () => {
    fc.assert(
      fc.property(sequences, stepArb, (history, step) => {
        const prior = replay(history).at(-1) as NodeMastery;
        const next = replay([...history, step]).at(-1) as NodeMastery;
        if (step.result.kind === "ANSWERED" && step.result.isCorrect) {
          expect(next.masteryScore).toBeGreaterThanOrEqual(prior.masteryScore - 1e-12);
        } else {
          expect(next.masteryScore).toBeLessThanOrEqual(prior.masteryScore + 1e-12);
        }
      }),
    );
  });

  it("is deterministic: the same sequence always yields the same state", () => {
    fc.assert(
      fc.property(sequences, (steps) => {
        expect(replay(steps)).toEqual(replay(steps));
      }),
    );
  });

  it("never declares MASTERED on its own", () => {
    fc.assert(
      fc.property(sequences, (steps) => {
        for (const node of replay(steps)) expect(node.state).not.toBe("MASTERED");
      }),
    );
  });
});
