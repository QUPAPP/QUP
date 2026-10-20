import type { SuggestedDifficulty } from "@qup/ai-gateway";

/** Joins a skill's name to its subskill's, so the model sees where a subskill belongs. */
export const SUBSKILL_SEPARATOR = " › ";

/** A node the metadata suggestion may choose; exactly one of the two ids is set. */
export interface AssistNode {
  id: string;
  name: string;
  skillId: string | null;
  subskillId: string | null;
}

/** The part of a taxonomy outline the suggestion reads. */
export interface AssistOutline {
  domains: {
    skills: { id: string; name: string; subskills: { id: string; name: string }[] }[];
  }[];
}

/** Every active skill, each followed by its subskills, in outline order. */
export function assistNodes(outline: AssistOutline): AssistNode[] {
  return outline.domains.flatMap((domain) =>
    domain.skills.flatMap((skill) => [
      { id: skill.id, name: skill.name, skillId: skill.id, subskillId: null },
      ...skill.subskills.map((subskill) => ({
        id: subskill.id,
        name: `${skill.name}${SUBSKILL_SEPARATOR}${subskill.name}`,
        skillId: null,
        subskillId: subskill.id,
      })),
    ]),
  );
}

/**
 * The editor's difficulty is a number in 0..1 (ADAPTIVE_ENGINE.md §4); the
 * model answers in three levels, placed at the quarter points
 * (OPEN_QUESTIONS.md #19a).
 */
export const DIFFICULTY_VALUES: Readonly<Record<SuggestedDifficulty, number>> = Object.freeze({
  EASY: 0.25,
  MEDIUM: 0.5,
  HARD: 0.75,
});
