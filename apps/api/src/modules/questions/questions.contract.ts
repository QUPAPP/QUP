import type { MappingRole, QuestionType, RichContent } from "./domain/question-content.js";

/**
 * Public read contract of the question bank, for assessments (AGENTS.md §5).
 * Owned here, the provider: assessments → questions, never back.
 *
 * `DeliverableQuestion` includes the answer key because grading happens on
 * the server. It must never be serialized to a student as-is — students get
 * `toStudentQuestionView` (domain/student-view.ts).
 */

/** A published version eligible for sampling, located by its PRIMARY mapping. */
export interface QuestionCandidate {
  questionVersionId: string;
  questionId: string;
  difficulty: number;
  primarySkillId: string | null;
  primarySubskillId: string | null;
}

export interface DeliverableQuestion {
  questionVersionId: string;
  questionId: string;
  questionType: QuestionType;
  stem: RichContent;
  /** Shown only after the student's attempt is stored, and only where the session allows it. */
  explanation: RichContent | null;
  difficulty: number;
  options: { key: string; content: RichContent; isCorrect: boolean; displayOrder: number }[];
  mappings: {
    skillId: string | null;
    subskillId: string | null;
    role: MappingRole;
    attributionWeight: number;
  }[];
}

export interface QuestionReader {
  /** PUBLISHED versions of non-archived questions written against the taxonomy version. */
  publishedCandidates(taxonomyVersionId: string): Promise<QuestionCandidate[]>;
  /** Full versions by id; ids that do not exist are absent from the map. */
  forDelivery(questionVersionIds: readonly string[]): Promise<Map<string, DeliverableQuestion>>;
  /**
   * The node each version primarily measures — exactly one of the two ids is
   * set. Any status: a past session stays reportable after its questions are
   * archived. Carries no content and no answer key.
   */
  primaryTargetsOf(
    questionVersionIds: readonly string[],
  ): Promise<Map<string, { skillId: string | null; subskillId: string | null }>>;
  /** The logical question of each version. */
  questionIdsOf(questionVersionIds: readonly string[]): Promise<Map<string, string>>;
  /** Every version of a logical question — repeats are counted per question, not per version. */
  versionIdsOf(questionId: string): Promise<string[]>;
}

export const QUESTION_READER = Symbol("QUESTION_READER");
