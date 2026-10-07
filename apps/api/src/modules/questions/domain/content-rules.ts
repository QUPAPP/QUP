import type { DraftContent, MappingDraft, OptionDraft, QuestionType } from "./question-content.js";

/**
 * What a version must satisfy before it can go to review and be published
 * (DOMAIN_MODEL.md §3: "السؤال المنشور يجب أن يملك correct answer صالحًا" and
 * "mapping تعليميًا صالحًا"). Drafts may be incomplete while being written; these
 * rules gate submission and publishing, and the database re-checks the core
 * of them at publish time (migration 0007).
 *
 * Returns human-readable problems; an empty list means publishable.
 */

const OPTION_COUNT: Record<QuestionType, { min: number; max: number }> = {
  SINGLE_CHOICE: { min: 2, max: 6 },
  MULTIPLE_CHOICE: { min: 2, max: 6 },
  TRUE_FALSE: { min: 2, max: 2 },
};

export function answerKeyProblems(type: QuestionType, options: readonly OptionDraft[]): string[] {
  const problems: string[] = [];
  const { min, max } = OPTION_COUNT[type];
  if (options.length < min || options.length > max) {
    problems.push(
      min === max
        ? `${type} needs exactly ${min} options.`
        : `${type} needs between ${min} and ${max} options.`,
    );
  }

  const correct = options.filter((option) => option.isCorrect).length;
  if (type === "MULTIPLE_CHOICE") {
    if (correct === 0) problems.push("At least one option must be marked correct.");
  } else if (correct !== 1) {
    problems.push("Exactly one option must be marked correct.");
  }
  return problems;
}

export function mappingProblems(mappings: readonly MappingDraft[]): string[] {
  const problems: string[] = [];
  const primaries = mappings.filter((mapping) => mapping.role === "PRIMARY").length;
  if (primaries !== 1) {
    problems.push("Exactly one PRIMARY skill mapping is required.");
  }
  return problems;
}

export function publishabilityProblems(content: DraftContent): string[] {
  return [
    ...answerKeyProblems(content.questionType, content.options),
    ...mappingProblems(content.mappings),
  ];
}

/** Structural rules that hold even for an unfinished draft. */
export function structuralProblems(content: DraftContent): string[] {
  const problems: string[] = [];
  const keys = content.options.map((option) => option.key);
  if (new Set(keys).size !== keys.length) problems.push("Option keys must be unique.");

  const nodes = content.mappings.map((m) => m.skillId ?? m.subskillId);
  if (new Set(nodes).size !== nodes.length) {
    problems.push("A skill or subskill can be mapped only once.");
  }
  return problems;
}
