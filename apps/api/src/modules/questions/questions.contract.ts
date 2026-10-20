import type { ActorContext } from "../../common/actor.js";
import type {
  DraftContent,
  MappingRole,
  QuestionType,
  QuestionVersionStatus,
  RichContent,
} from "./domain/question-content.js";

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

/** A version as plain text with its answer key, for AI assistance to its author (C3). */
export interface AssistedVersion {
  id: string;
  status: QuestionVersionStatus;
  taxonomyVersionId: string;
  /** Text and math sources in order; no markup. */
  stem: string;
  options: { key: string; text: string; isCorrect: boolean }[];
}

/**
 * Writing questions from outside the editor (content import, A3): the same
 * content rules and the same draft path an author goes through, so imported
 * content enters review like any other draft and is never published by itself.
 * Also the author's view of one version for AI assistance (C3).
 */
export interface QuestionAuthor {
  /** What review would refuse in this complete question (answer key, mappings, structure). */
  contentProblems(content: DraftContent): { rule: string; message: string }[];
  /** Creates a DRAFT question as the actor; refuses invalid content (QUESTION_CONTENT_INVALID). */
  createDraft(
    content: DraftContent,
    actor: ActorContext,
  ): Promise<{ questionId: string; versionId: string }>;
  /** Stem text of every version of the exam's questions that are not archived (duplicate checks). */
  stemTextsInExam(examId: string): Promise<{ questionId: string; text: string }[]>;
  /** The version in any status, or null when it does not exist. Includes the answer key: server only. */
  assistedVersion(versionId: string): Promise<AssistedVersion | null>;
}

export const QUESTION_AUTHOR = Symbol("QUESTION_AUTHOR");

export type {
  DraftContent,
  QuestionVersionStatus,
  RichContent,
} from "./domain/question-content.js";
export { DEFAULT_ATTRIBUTION_WEIGHT } from "./domain/question-content.js";
