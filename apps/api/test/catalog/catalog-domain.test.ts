import { describe, expect, it } from "vitest";

import { masteryThreshold, weight } from "../../src/common/validation/schemas.js";
import { canTransitionExam } from "../../src/modules/catalog/domain/exam-lifecycle.js";
import {
  type PrerequisiteEdge,
  wouldCreateCycle,
} from "../../src/modules/catalog/domain/prerequisite-graph.js";

const edge = (skillId: string, prerequisiteSkillId: string): PrerequisiteEdge => ({
  skillId,
  prerequisiteSkillId,
});

describe("prerequisite cycles", () => {
  it("rejects a skill that requires itself", () => {
    expect(wouldCreateCycle([], "A", "A")).toBe(true);
  });

  it("rejects the reverse of an existing edge", () => {
    expect(wouldCreateCycle([edge("A", "B")], "B", "A")).toBe(true);
  });

  it("rejects closing a long chain into a loop", () => {
    const chain = [edge("A", "B"), edge("B", "C"), edge("C", "D")];
    expect(wouldCreateCycle(chain, "D", "A")).toBe(true);
  });

  it("allows a diamond, which shares prerequisites without looping", () => {
    // A needs B and C; both need D. Adding A → D is redundant but acyclic.
    const diamond = [edge("A", "B"), edge("A", "C"), edge("B", "D"), edge("C", "D")];
    expect(wouldCreateCycle(diamond, "A", "D")).toBe(false);
  });

  it("allows edges between unrelated parts of the graph", () => {
    expect(wouldCreateCycle([edge("A", "B")], "C", "D")).toBe(false);
  });

  it("terminates on graphs that already share nodes heavily", () => {
    const dense = ["B", "C", "D", "E"].flatMap((x) =>
      ["B", "C", "D", "E"].filter((y) => y > x).map((y) => edge(x, y)),
    );
    expect(wouldCreateCycle(dense, "A", "B")).toBe(false);
    expect(wouldCreateCycle(dense, "E", "B")).toBe(true);
  });
});

describe("exam lifecycle", () => {
  it.each([
    ["DRAFT", "ACTIVE", true],
    ["DRAFT", "ARCHIVED", true],
    ["ACTIVE", "ARCHIVED", true],
    ["ACTIVE", "DRAFT", false],
    ["ARCHIVED", "ACTIVE", false],
    ["ARCHIVED", "DRAFT", false],
  ] as const)("%s → %s allowed: %s", (from, to, allowed) => {
    expect(canTransitionExam(from, to)).toBe(allowed);
  });
});

describe("decimal fields match their database columns", () => {
  it("accepts weights up to numeric(6,4)", () => {
    expect(weight.safeParse(1).success).toBe(true);
    expect(weight.safeParse(99.9999).success).toBe(true);
    expect(weight.safeParse(0.1 + 0.2).success).toBe(true); // float noise, not a 5th decimal
  });

  it("rejects values the column would round or overflow", () => {
    expect(weight.safeParse(1.23456).success).toBe(false);
    expect(weight.safeParse(100).success).toBe(false);
    expect(weight.safeParse(0).success).toBe(false);
    expect(weight.safeParse(Number.NaN).success).toBe(false);
  });

  it("keeps mastery thresholds within (0, 1] at three decimals", () => {
    expect(masteryThreshold.safeParse(0.85).success).toBe(true);
    expect(masteryThreshold.safeParse(1).success).toBe(true);
    expect(masteryThreshold.safeParse(1.5).success).toBe(false);
    expect(masteryThreshold.safeParse(0.8555).success).toBe(false);
  });
});
