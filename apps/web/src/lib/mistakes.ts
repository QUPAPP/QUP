import type { TrainingMistake } from "./api";

export function mistakeSkills(items: readonly TrainingMistake[]): string[] {
  const names = new Set<string>();
  for (const item of items) if (item.skillName) names.add(item.skillName);
  return [...names];
}

export function filterMistakes(
  items: readonly TrainingMistake[],
  { skill, openOnly }: { skill: string | null; openOnly: boolean },
): TrainingMistake[] {
  return items.filter(
    (item) => (skill === null || item.skillName === skill) && (!openOnly || !item.correctedLater),
  );
}
