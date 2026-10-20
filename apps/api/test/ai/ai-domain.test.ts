import { describe, expect, it } from "vitest";

import { assistNodes, DIFFICULTY_VALUES } from "../../src/modules/ai/domain/assist-nodes.js";

/** C3: what the metadata suggestion may choose from, and what its levels mean (OPEN_QUESTIONS #19a). */

describe("assistNodes", () => {
  it("lists each skill, then its subskills named after it", () => {
    const outline = {
      domains: [
        {
          skills: [
            { id: "s1", name: "التناظر", subskills: [] },
            { id: "s2", name: "المرادفات", subskills: [{ id: "ss1", name: "الأفعال" }] },
          ],
        },
        { skills: [{ id: "s3", name: "الجبر", subskills: [] }] },
      ],
    };
    expect(assistNodes(outline)).toEqual([
      { id: "s1", name: "التناظر", skillId: "s1", subskillId: null },
      { id: "s2", name: "المرادفات", skillId: "s2", subskillId: null },
      { id: "ss1", name: "المرادفات › الأفعال", skillId: null, subskillId: "ss1" },
      { id: "s3", name: "الجبر", skillId: "s3", subskillId: null },
    ]);
  });

  it("has nothing to offer for a taxonomy without skills", () => {
    expect(assistNodes({ domains: [{ skills: [] }] })).toEqual([]);
  });
});

describe("DIFFICULTY_VALUES", () => {
  it("places the three levels on the editor's 0..1 scale", () => {
    expect(DIFFICULTY_VALUES).toEqual({ EASY: 0.25, MEDIUM: 0.5, HARD: 0.75 });
  });
});
