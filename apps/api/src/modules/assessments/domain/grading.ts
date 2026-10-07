import type { QuestionType } from "../../questions/domain/question-content.js";

/**
 * Server-side grading (DOMAIN_MODEL.md §3: "backend هو source of truth للتصحيح";
 * TESTING.md: "forged isCorrect ignored"). The client sends only which option
 * keys it chose; correctness is decided here, from the stored answer key.
 */

export type GradeResult = { ok: true; isCorrect: boolean } | { ok: false; reason: string };

export function gradeChoice(
  questionType: QuestionType,
  options: readonly { key: string; isCorrect: boolean }[],
  chosenKeys: readonly string[],
): GradeResult {
  const chosen = new Set(chosenKeys);
  if (chosen.size !== chosenKeys.length)
    return { ok: false, reason: "An option was chosen twice." };

  const known = new Set(options.map((o) => o.key));
  for (const key of chosen) {
    if (!known.has(key))
      return { ok: false, reason: `"${key}" is not an option of this question.` };
  }

  if (questionType !== "MULTIPLE_CHOICE" && chosen.size !== 1) {
    return { ok: false, reason: "Choose exactly one option." };
  }
  if (chosen.size === 0) return { ok: false, reason: "Choose at least one option." };

  // Correct means the chosen set is exactly the set of correct options.
  const correct = options.filter((o) => o.isCorrect).map((o) => o.key);
  const isCorrect = correct.length === chosen.size && correct.every((key) => chosen.has(key));
  return { ok: true, isCorrect };
}
