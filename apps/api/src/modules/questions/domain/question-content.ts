/**
 * Question content model.
 *
 * Structured blocks, not HTML: the stem, options and explanation are stored
 * as data and rendered by the client, so author input can never become markup
 * in another user's browser (SECURITY.md "output encoding/sanitization").
 * Images arrive with object storage; until then, text and math only.
 */

export type ContentBlock = { type: "text"; text: string } | { type: "math"; latex: string };

export interface RichContent {
  blocks: ContentBlock[];
}

/** V1 supports choice questions only (OPEN_QUESTIONS.md #16c). */
export type QuestionType = "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TRUE_FALSE";

export type QuestionVersionStatus =
  | "DRAFT"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "PUBLISHED"
  | "ARCHIVED";

export type MappingRole = "PRIMARY" | "SECONDARY";

export interface OptionDraft {
  key: string;
  content: RichContent;
  isCorrect: boolean;
  displayOrder: number;
}

/** Exactly one of skillId / subskillId is set. */
export interface MappingDraft {
  skillId: string | null;
  subskillId: string | null;
  role: MappingRole;
  attributionWeight: number;
  rationale: string | null;
}

/** Everything an author edits on a DRAFT version. */
export interface DraftContent {
  questionType: QuestionType;
  stem: RichContent;
  explanation: RichContent | null;
  /** Author's difficulty estimate, 0..1 (ADAPTIVE_ENGINE.md §4). */
  difficulty: number;
  taxonomyVersionId: string;
  sourceType: string | null;
  sourceReference: string | null;
  options: OptionDraft[];
  mappings: MappingDraft[];
}

/**
 * Default attribution weights (DOMAIN_MODEL.md §6, ADAPTIVE_ENGINE.md §7).
 * Applied when the author does not set a weight; stored on each mapping so a
 * later change of defaults never rewrites existing questions.
 */
export const DEFAULT_ATTRIBUTION_WEIGHT: Readonly<Record<MappingRole, number>> = {
  PRIMARY: 1,
  SECONDARY: 0.35,
};
