import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  REASSESSMENT_CONFIG_V1 as config,
  holdRemaining,
  reassessmentPassed,
  requiredCorrect,
} from "../src/index.js";

/** ADAPTIVE_ENGINE.md §13 and WORKFLOWS.md §5: 5 questions, pass 4/5 plus the final conditions. */

describe("reassessment pass (§13)", () => {
  it("needs four of five", () => {
    expect(config.questionCount).toBe(5);
    expect(requiredCorrect(5, config)).toBe(4);
  });

  it.each([
    ["5/5 and still ready", 5, true, true],
    ["4/5 and still ready", 4, true, true],
    ["4/5 but no longer ready", 4, false, false],
    ["3/5 even if ready", 3, true, false],
  ] as const)("%s", (_name, correct, readyAfter, passed) => {
    expect(reassessmentPassed({ correct, total: 5, readyAfter }, config)).toBe(passed);
  });

  it("never asks for none or more than all", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 200 }), (total) => {
        const required = requiredCorrect(total, config);
        expect(required).toBeGreaterThanOrEqual(1);
        expect(required).toBeLessThanOrEqual(total);
      }),
    );
  });
});

describe("retry hold after a failure (§13: 5 new eligible attempts)", () => {
  it.each([
    ["just failed", true, 0, 5],
    ["two answers since", true, 2, 3],
    ["five answers since", true, 5, null],
    ["more than enough", true, 9, null],
    ["passed: no hold", false, 0, null],
  ] as const)("%s", (_name, failed, attemptsSince, remaining) => {
    expect(holdRemaining({ failed, attemptsSince }, config)).toBe(remaining);
  });
});
