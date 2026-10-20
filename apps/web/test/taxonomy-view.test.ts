import { describe, expect, it } from "vitest";

import type { DomainNode, NodeStatus, SkillNode, TaxonomyTree } from "../src/lib/admin-api";
import { prerequisiteCandidates, skillNames } from "../src/lib/taxonomy-view";

function skill(id: string, status: NodeStatus = "ACTIVE", prerequisites: string[] = []): SkillNode {
  return {
    id,
    code: id.toUpperCase(),
    name: `مهارة ${id}`,
    description: null,
    weight: 1,
    masteryThreshold: null,
    priorityWeight: 1,
    minCoverage: 0,
    displayOrder: 0,
    status,
    prerequisites: prerequisites.map((prerequisiteSkillId) => ({
      prerequisiteSkillId,
      importanceWeight: 1,
    })),
    subskills: [],
  };
}

function domain(id: string, skills: SkillNode[], status: NodeStatus = "ACTIVE"): DomainNode {
  return {
    id,
    code: id.toUpperCase(),
    name: `مجال ${id}`,
    description: null,
    weight: 1,
    displayOrder: 0,
    status,
    skills,
  };
}

const tree: TaxonomyTree = {
  version: {
    id: "v1",
    examId: "e1",
    versionCode: "1",
    status: "DRAFT",
    effectiveFrom: null,
    createdAt: "2026-10-20T00:00:00.000Z",
  },
  domains: [
    domain("verbal", [skill("a", "ACTIVE", ["b"]), skill("b"), skill("old", "ARCHIVED")]),
    domain("quant", [skill("c"), skill("d")]),
    domain("retired", [skill("e")], "ARCHIVED"),
  ],
};

describe("taxonomy view helpers", () => {
  it("names every skill, archived ones included", () => {
    const names = skillNames(tree);
    expect(names.get("b")).toBe("مهارة b");
    expect(names.get("old")).toBe("مهارة old");
    expect(names.size).toBe(6);
  });

  it("offers active skills other than the skill itself and its current prerequisites", () => {
    expect(prerequisiteCandidates(tree, "a").map((candidate) => candidate.id)).toEqual(["c", "d"]);
  });

  it("leaves out archived skills and skills of archived domains", () => {
    const ids = prerequisiteCandidates(tree, "c").map((candidate) => candidate.id);
    expect(ids).not.toContain("old");
    expect(ids).not.toContain("e");
  });

  it("keeps the tree's order", () => {
    expect(prerequisiteCandidates(tree, "d").map((candidate) => candidate.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});
