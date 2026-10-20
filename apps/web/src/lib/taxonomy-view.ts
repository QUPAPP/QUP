import type { SkillNode, TaxonomyTree } from "./admin-api";

/** Skill id → name for every skill in the version, so prerequisites read as names. */
export function skillNames(tree: TaxonomyTree): Map<string, string> {
  return new Map(
    tree.domains.flatMap((domain) => domain.skills.map((skill) => [skill.id, skill.name] as const)),
  );
}

/**
 * Skills worth offering as prerequisites of `skillId`: active skills in
 * active domains, other than the skill itself and those already linked, in
 * the tree's order. A display filter only — whether a link forms a cycle is
 * decided by the API (PREREQUISITE_CYCLE).
 */
export function prerequisiteCandidates(tree: TaxonomyTree, skillId: string): SkillNode[] {
  const target = tree.domains
    .flatMap((domain) => domain.skills)
    .find((skill) => skill.id === skillId);
  const linked = new Set(target?.prerequisites.map((link) => link.prerequisiteSkillId));

  return tree.domains
    .filter((domain) => domain.status === "ACTIVE")
    .flatMap((domain) => domain.skills)
    .filter((skill) => skill.status === "ACTIVE" && skill.id !== skillId && !linked.has(skill.id));
}
