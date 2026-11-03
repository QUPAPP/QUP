import { describe, expect, it } from "vitest";

import { firstName, skillStateSegments, tileState } from "../src/lib/dashboard-view";

const summary = (skills: number, assessed: number) => ({
  skills,
  assessed,
  gaps: 0,
  readyForReassessment: 0,
  mastered: 0,
});

describe("dashboard view", () => {
  it("splits the skills by state, with the remainder as developing and unmeasured", () => {
    const counts = skillStateSegments({
      skills: 12,
      assessed: 9,
      gaps: 3,
      readyForReassessment: 1,
      mastered: 2,
    }).map((segment) => [segment.key, segment.count]);
    expect(counts).toEqual([
      ["mastered", 2],
      ["ready", 1],
      ["developing", 3],
      ["gap", 3],
      ["unassessed", 3],
    ]);
  });

  it("never draws a negative count from an inconsistent summary", () => {
    const counts = skillStateSegments({ ...summary(2, 3), gaps: 4 }).map((s) => s.count);
    expect(counts.every((count) => count >= 0)).toBe(true);
  });

  it("greets by the first name only", () => {
    expect(firstName("ريم العتيبي")).toBe("ريم");
    expect(firstName("  فهد  ")).toBe("فهد");
    expect(firstName("   ")).toBeNull();
    expect(firstName(null)).toBeNull();
  });
});

describe("tileState", () => {
  it("draws each mastery state as one of the five tile colours", () => {
    expect(tileState("MASTERED")).toBe("mastered");
    expect(tileState("READY_FOR_REASSESSMENT")).toBe("ready");
    expect(tileState("GAP")).toBe("gap");
    expect(tileState("UNASSESSED")).toBe("unassessed");
    expect(tileState("DEVELOPING")).toBe("developing");
    expect(tileState("UNCERTAIN")).toBe("developing");
  });
});
