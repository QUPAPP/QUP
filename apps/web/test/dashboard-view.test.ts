import { describe, expect, it } from "vitest";

import { coverageShare, firstName } from "../src/lib/dashboard-view";

const summary = (skills: number, assessed: number) => ({
  skills,
  assessed,
  gaps: 0,
  readyForReassessment: 0,
  mastered: 0,
});

describe("dashboard view", () => {
  it("reports how much of the exam the diagnostics have measured", () => {
    expect(coverageShare(summary(8, 6))).toBe(0.75);
    expect(coverageShare(summary(8, 8))).toBe(1);
  });

  it("never divides by an empty taxonomy or exceeds the whole", () => {
    expect(coverageShare(summary(0, 0))).toBe(0);
    expect(coverageShare(summary(4, 5))).toBe(1);
  });

  it("greets by the first name only", () => {
    expect(firstName("ريم العتيبي")).toBe("ريم");
    expect(firstName("  فهد  ")).toBe("فهد");
    expect(firstName("   ")).toBeNull();
    expect(firstName(null)).toBeNull();
  });
});
