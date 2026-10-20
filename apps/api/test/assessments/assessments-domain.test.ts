import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { apportion } from "../../src/modules/assessments/domain/apportion.js";
import {
  type PlanDomain,
  planDiagnostic,
} from "../../src/modules/assessments/domain/diagnostic-plan.js";
import { gradeChoice } from "../../src/modules/assessments/domain/grading.js";

/** Deterministic PRNG (mulberry32), so random tie-breaks are reproducible in tests. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const sum = (map: Map<string, number>) => [...map.values()].reduce((a, b) => a + b, 0);

describe("apportion", () => {
  it("splits in proportion to weight, exactly", () => {
    const result = apportion(12, [
      { key: "verbal", weight: 1, capacity: 100 },
      { key: "quant", weight: 2, capacity: 100 },
    ]);
    expect(Object.fromEntries(result)).toEqual({ verbal: 4, quant: 8 });
  });

  it("gives a capped entry's unused share to the others", () => {
    const result = apportion(12, [
      { key: "small", weight: 5, capacity: 2 },
      { key: "large", weight: 1, capacity: 100 },
    ]);
    expect(Object.fromEntries(result)).toEqual({ small: 2, large: 10 });
  });

  it("never exceeds capacity or the total, and uses all it can (property)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 40 }),
        fc.array(
          fc.record({
            weight: fc.double({ min: 0.01, max: 10, noNaN: true }),
            capacity: fc.integer({ min: 0, max: 15 }),
          }),
          { minLength: 1, maxLength: 6 },
        ),
        (total, raw) => {
          const entries = raw.map((e, i) => ({ key: `k${i}`, ...e }));
          const result = apportion(total, entries);
          const capacity = entries.reduce((s, e) => s + e.capacity, 0);
          for (const entry of entries) {
            expect(result.get(entry.key)).toBeLessThanOrEqual(entry.capacity);
          }
          expect(sum(result)).toBe(Math.min(total, capacity));
        },
      ),
    );
  });
});

function candidates(skill: string, difficulties: number[]) {
  return difficulties.map((difficulty, i) => ({
    questionVersionId: `${skill}-v${i}`,
    questionId: `${skill}-q${i}`,
    difficulty,
  }));
}

describe("diagnostic plan", () => {
  const domains: PlanDomain[] = [
    {
      id: "verbal",
      weight: 1,
      skills: [
        {
          id: "analogy",
          weight: 1,
          candidates: candidates("analogy", [0.1, 0.5, 0.55, 0.9, 0.4, 0.2]),
        },
      ],
    },
    {
      id: "quant",
      weight: 2,
      skills: [
        {
          id: "algebra",
          weight: 1,
          candidates: candidates("algebra", [0.5, 0.5, 0.5, 0.5, 0.5, 0.5]),
        },
        {
          id: "geometry",
          weight: 1,
          candidates: candidates("geometry", [0.5, 0.5, 0.5, 0.5, 0.5, 0.5]),
        },
      ],
    },
  ];

  const plan = (size: number, seed = 1, source = domains) =>
    planDiagnostic({ domains: source, size, targetDifficulty: 0.5, random: seeded(seed) });
  const continuing = (size: number, answered: Record<string, number>) =>
    planDiagnostic({
      domains,
      size,
      targetDifficulty: 0.5,
      random: seeded(1),
      answered: new Map(Object.entries(answered)),
    });
  const perSkill = (items: { skillId: string }[], id: string) =>
    items.filter((i) => i.skillId === id).length;

  it("covers domains in proportion to their weight", () => {
    const items = plan(6);
    const perDomain = (id: string) => items.filter((i) => i.domainId === id).length;
    expect(perDomain("verbal")).toBe(2);
    expect(perDomain("quant")).toBe(4);
  });

  it("prefers questions nearest the target difficulty", () => {
    const verbal = plan(6).filter((i) => i.domainId === "verbal");
    expect(verbal.map((i) => i.difficulty).sort()).toEqual([0.5, 0.55]);
  });

  it("never repeats a question", () => {
    const items = plan(18);
    expect(new Set(items.map((i) => i.questionId)).size).toBe(items.length);
  });

  it("uses what exists when there are fewer questions than requested", () => {
    expect(plan(100)).toHaveLength(18);
  });

  it("interleaves domains rather than running them in blocks", () => {
    expect(
      plan(6)
        .slice(0, 2)
        .map((i) => i.domainId),
    ).toEqual(["verbal", "quant"]);
  });

  it("counts questions already answered towards each skill's share (PRD §7)", () => {
    // Shares of 6: analogy 2, algebra 2, geometry 2. One analogy question is already answered.
    const items = continuing(6, { analogy: 1 });
    expect(perSkill(items, "analogy")).toBe(1);
    expect(perSkill(items, "algebra")).toBe(2);
    expect(perSkill(items, "geometry")).toBe(2);
  });

  it("asks nothing more on a skill answered beyond its share, and leaves the others alone", () => {
    const items = continuing(6, { analogy: 5 });
    expect(perSkill(items, "analogy")).toBe(0);
    expect(perSkill(items, "algebra")).toBe(2);
    expect(perSkill(items, "geometry")).toBe(2);
  });

  it("plans nothing when every share is already answered", () => {
    expect(continuing(6, { analogy: 2, algebra: 2, geometry: 2 })).toEqual([]);
  });

  it("ignores answered counts for skills outside the taxonomy", () => {
    expect(continuing(6, { retired: 9 }).map((i) => i.questionVersionId)).toEqual(
      plan(6).map((i) => i.questionVersionId),
    );
  });

  it("is reproducible for a given random source, and varies across sources", () => {
    const ids = (seed: number) => plan(6, seed).map((i) => i.questionVersionId);
    expect(ids(7)).toEqual(ids(7));
    const forms = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => ids(seed).join()));
    expect(forms.size).toBeGreaterThan(1);
  });
});

// DOMAIN_MODEL.md §3 / TESTING.md: grading is the server's, from the stored key.
describe("grading", () => {
  const single = [
    { key: "A", isCorrect: false },
    { key: "B", isCorrect: true },
  ];
  const multiple = [
    { key: "A", isCorrect: true },
    { key: "B", isCorrect: true },
    { key: "C", isCorrect: false },
  ];

  it("grades a single choice", () => {
    expect(gradeChoice("SINGLE_CHOICE", single, ["B"])).toEqual({ ok: true, isCorrect: true });
    expect(gradeChoice("SINGLE_CHOICE", single, ["A"])).toEqual({ ok: true, isCorrect: false });
  });

  it("requires exactly the set of correct options for multiple choice", () => {
    expect(gradeChoice("MULTIPLE_CHOICE", multiple, ["B", "A"])).toEqual({
      ok: true,
      isCorrect: true,
    });
    expect(gradeChoice("MULTIPLE_CHOICE", multiple, ["A"])).toEqual({ ok: true, isCorrect: false });
    expect(gradeChoice("MULTIPLE_CHOICE", multiple, ["A", "B", "C"])).toEqual({
      ok: true,
      isCorrect: false,
    });
  });

  it("rejects keys that are not options, duplicates, and wrong counts", () => {
    expect(gradeChoice("SINGLE_CHOICE", single, ["Z"]).ok).toBe(false);
    expect(gradeChoice("SINGLE_CHOICE", single, ["A", "B"]).ok).toBe(false);
    expect(gradeChoice("MULTIPLE_CHOICE", multiple, ["A", "A"]).ok).toBe(false);
    expect(gradeChoice("MULTIPLE_CHOICE", multiple, []).ok).toBe(false);
  });
});
