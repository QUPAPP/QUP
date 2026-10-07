/**
 * §14 — a skill with subskills takes its mastery from them:
 *
 *   SkillMastery = weightedAverage(SubSkillMastery)
 *
 * A derived projection, never edited by hand (DOMAIN_MODEL.md §5). Coverage is
 * kept separate: mastery 0.90 with coverage 0.25 is not mastery of the skill.
 * Only subskills with evidence contribute; returns null when none has any.
 */
export function parentMastery(
  children: readonly { masteryScore: number; evidenceCount: number; weight: number }[],
): number | null {
  let weighted = 0;
  let totalWeight = 0;
  for (const child of children) {
    if (child.evidenceCount === 0 || child.weight <= 0) continue;
    weighted += child.masteryScore * child.weight;
    totalWeight += child.weight;
  }
  return totalWeight === 0 ? null : weighted / totalWeight;
}
