import { MOCK_EXAM_DEFAULTS } from "./assessment-config.js";

const MS_PER_SECOND = 1000;

/** When a mock exam's clock runs out: null until the student starts it. */
export function mockDeadline(startedAt: Date | null, itemCount: number): Date | null {
  if (!startedAt) return null;
  return new Date(
    startedAt.getTime() + itemCount * MOCK_EXAM_DEFAULTS.secondsPerQuestion * MS_PER_SECOND,
  );
}

export function isPastDeadline(deadline: Date | null, now: Date): boolean {
  return deadline !== null && now.getTime() >= deadline.getTime();
}

export interface MockSkillResult {
  skillId: string;
  skillName: string;
  correct: number;
  total: number;
}

/** Correct answers per skill and overall; skipped and unanswered items count as wrong. */
export function summarizeMock(
  measured: readonly { skillId: string; outcome: "CORRECT" | "INCORRECT" | "NOT_ANSWERED" }[],
  skillNames: ReadonlyMap<string, string>,
) {
  const bySkill = new Map<string, MockSkillResult>();
  for (const item of measured) {
    const entry = bySkill.get(item.skillId) ?? {
      skillId: item.skillId,
      skillName: skillNames.get(item.skillId) ?? "",
      correct: 0,
      total: 0,
    };
    entry.total += 1;
    if (item.outcome === "CORRECT") entry.correct += 1;
    bySkill.set(item.skillId, entry);
  }
  const correct = measured.filter((item) => item.outcome === "CORRECT").length;
  const answered = measured.filter((item) => item.outcome !== "NOT_ANSWERED").length;
  return {
    correct,
    answered,
    total: measured.length,
    // Weakest first: where the next study hour pays most.
    skills: [...bySkill.values()].sort(
      (a, b) => a.correct / a.total - b.correct / b.total || b.total - a.total,
    ),
  };
}
