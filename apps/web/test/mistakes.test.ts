import { afterEach, describe, expect, it, vi } from "vitest";

import { getTrainingMistakes, type TrainingMistake } from "../src/lib/api";
import { filterMistakes, mistakeSkills } from "../src/lib/mistakes";

afterEach(() => vi.unstubAllGlobals());

const text = (value: string) => ({ blocks: [{ type: "text" as const, text: value }] });

function mistake(id: string, skillName: string | null, correctedLater: boolean): TrainingMistake {
  return {
    questionVersionId: id,
    answeredAt: "2026-10-01T10:00:00.000Z",
    correctedLater,
    skillName,
    question: {
      questionType: "SINGLE_CHOICE",
      stem: text("س"),
      options: [
        { key: "A", content: text("1") },
        { key: "B", content: text("2") },
      ],
    },
    chosenKeys: ["A"],
    correctOptionKeys: ["B"],
    explanation: null,
  };
}

describe("mistakes review", () => {
  it("reads the caller's mistakes for one exam", async () => {
    const request = vi.fn().mockImplementation(async () => Response.json({ items: [] }));
    vi.stubGlobal("fetch", request);
    await getTrainingMistakes("e1");
    expect(request).toHaveBeenCalledWith(
      "/api/v1/exams/e1/mistakes",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  it("lists each skill once, in the order it first appears", () => {
    const items = [
      mistake("1", "الجبر", false),
      mistake("2", null, false),
      mistake("3", "الجبر", true),
      mistake("4", "الهندسة", false),
    ];
    expect(mistakeSkills(items)).toEqual(["الجبر", "الهندسة"]);
  });

  it("filters by skill and by what is still uncorrected", () => {
    const items = [
      mistake("1", "الجبر", false),
      mistake("2", "الجبر", true),
      mistake("3", "الهندسة", false),
    ];
    const ids = (list: TrainingMistake[]) => list.map((m) => m.questionVersionId);
    expect(ids(filterMistakes(items, { skill: null, openOnly: false }))).toEqual(["1", "2", "3"]);
    expect(ids(filterMistakes(items, { skill: "الجبر", openOnly: false }))).toEqual(["1", "2"]);
    expect(ids(filterMistakes(items, { skill: "الجبر", openOnly: true }))).toEqual(["1"]);
    expect(ids(filterMistakes(items, { skill: null, openOnly: true }))).toEqual(["1", "3"]);
  });
});
