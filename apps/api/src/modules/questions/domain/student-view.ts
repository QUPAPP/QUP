import type { QuestionType, RichContent } from "./question-content.js";

/**
 * The only shape in which a question may reach a student before they answer
 * (SECURITY.md "future correct answer never sent to browser"; AGENTS.md §3:
 * never send correctAnswer to the client before the student answers).
 *
 * Built by listing what is allowed — not by deleting what is not — so a field
 * added to the question later cannot leak by default. Deliberately excluded:
 * which option is correct, the explanation, difficulty, skill mappings,
 * provenance and review history.
 */
export interface StudentQuestionView {
  questionVersionId: string;
  questionType: QuestionType;
  stem: RichContent;
  options: { key: string; content: RichContent }[];
}

export interface PresentableVersion {
  id: string;
  questionType: QuestionType;
  stem: RichContent;
  options: readonly { key: string; content: RichContent; displayOrder: number }[];
}

export function toStudentQuestionView(version: PresentableVersion): StudentQuestionView {
  return {
    questionVersionId: version.id,
    questionType: version.questionType,
    stem: version.stem,
    options: [...version.options]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((option) => ({ key: option.key, content: option.content })),
  };
}
