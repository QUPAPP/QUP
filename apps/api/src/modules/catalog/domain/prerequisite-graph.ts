/**
 * Prerequisite cycles (ERD.md skill_prerequisites: "No self/cycles";
 * WORKFLOWS.md §9 "Validate Cycles").
 *
 * An edge (skill → prerequisite) means "`skill` requires `prerequisite`". A
 * cycle would make remediation loop forever: the adaptive engine sends a
 * student from a failing skill to its prerequisite (PRD §15), which would
 * eventually point back to where it started.
 *
 * Adding skill → prerequisite creates a cycle exactly when `prerequisite`
 * already (transitively) requires `skill`, or when they are the same skill.
 */

export interface PrerequisiteEdge {
  skillId: string;
  prerequisiteSkillId: string;
}

export function wouldCreateCycle(
  existing: readonly PrerequisiteEdge[],
  skillId: string,
  prerequisiteSkillId: string,
): boolean {
  if (skillId === prerequisiteSkillId) return true;

  const requires = new Map<string, string[]>();
  for (const edge of existing) {
    const list = requires.get(edge.skillId) ?? [];
    list.push(edge.prerequisiteSkillId);
    requires.set(edge.skillId, list);
  }

  // Walk everything `prerequisiteSkillId` requires; reaching `skillId` closes a loop.
  const visited = new Set<string>();
  const pending = [prerequisiteSkillId];
  for (let current = pending.pop(); current !== undefined; current = pending.pop()) {
    if (current === skillId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    pending.push(...(requires.get(current) ?? []));
  }
  return false;
}
