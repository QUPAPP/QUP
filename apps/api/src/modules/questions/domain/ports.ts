import type { ActorContext } from "../../../common/actor.js";
import type {
  DraftContent,
  MappingDraft,
  OptionDraft,
  QuestionType,
  QuestionVersionStatus,
  RichContent,
} from "./question-content.js";

export interface QuestionVersionDetail {
  id: string;
  questionId: string;
  versionNumber: number;
  status: QuestionVersionStatus;
  questionType: QuestionType;
  stem: RichContent;
  explanation: RichContent | null;
  difficulty: number;
  taxonomyVersionId: string;
  sourceType: string | null;
  sourceReference: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  options: OptionDraft[];
  mappings: MappingDraft[];
  reviews: ReviewRecord[];
}

export interface ReviewRecord {
  reviewerId: string | null;
  decision: ReviewDecision;
  notes: string | null;
  createdAt: Date;
}

export type ReviewDecision = "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";

export interface VersionSummary {
  id: string;
  versionNumber: number;
  status: QuestionVersionStatus;
  questionType: QuestionType;
  taxonomyVersionId: string;
  updatedAt: Date;
}

export interface QuestionSummary {
  id: string;
  stableCode: string;
  archivedAt: Date | null;
  createdAt: Date;
  /** Newest first. */
  versions: VersionSummary[];
}

export interface QuestionListFilter {
  /** Status of each question's newest version. */
  status?: QuestionVersionStatus | undefined;
  taxonomyVersionId?: string | undefined;
  limit: number;
  offset: number;
}

export interface QuestionListItem {
  id: string;
  stableCode: string;
  archivedAt: Date | null;
  /** The list shows a one-line preview of the newest version's stem (stem-preview.ts). */
  latestVersion: VersionSummary & { stemPreview: string };
}

export interface QuestionStore {
  createQuestion(
    input: { stableCode: string; createdBy: string | null },
    content: DraftContent,
  ): Promise<QuestionVersionDetail>;
  findQuestion(questionId: string): Promise<QuestionSummary | null>;
  listQuestions(filter: QuestionListFilter): Promise<{ items: QuestionListItem[]; total: number }>;
  findVersion(versionId: string): Promise<QuestionVersionDetail | null>;

  /** New DRAFT copying `copyFrom`'s content. Throws VersionAlreadyInProgress. */
  createNextVersion(
    questionId: string,
    copyFrom: QuestionVersionDetail,
    createdBy: string | null,
  ): Promise<QuestionVersionDetail>;
  /** Replaces the whole content of a DRAFT (options and mappings included), atomically. */
  replaceDraftContent(versionId: string, content: DraftContent): Promise<void>;

  /**
   * Conditional status change: applies only if the version is still in `from`.
   * Throws QuestionVersionChanged when another request moved it first.
   */
  transition(
    versionId: string,
    from: QuestionVersionStatus,
    to: QuestionVersionStatus,
  ): Promise<void>;
  /** Records the review and applies the resulting transition, atomically. */
  recordReview(
    versionId: string,
    review: { reviewerId: string | null; decision: ReviewDecision; notes: string | null },
    nextStatus: QuestionVersionStatus,
  ): Promise<void>;
  /** Archives the question's live version, publishes this one, audits — atomically. */
  publish(version: QuestionVersionDetail, actor: ActorContext): Promise<void>;
  /** Marks the question archived, archives all its non-archived versions, audits. */
  archiveQuestion(questionId: string, actor: ActorContext): Promise<void>;
}

export const QUESTION_STORE = Symbol("QUESTION_STORE");
