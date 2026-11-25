/**
 * Question content model.
 *
 * Structured blocks, not HTML: the stem, options and explanation are stored
 * as data and rendered by the client, so author input can never become markup
 * in another user's browser (SECURITY.md "output encoding/sanitization").
 * Images and audio point at a question asset (question-assets.ts) by id: the
 * bytes live in private storage and are served by the API.
 */

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "math"; latex: string }
  /** A figure, chart or table; `alt` is what a screen reader says instead. */
  | { type: "image"; assetId: string; alt: string }
  /** A listening passage (STEP). Only in the stem. */
  | { type: "audio"; assetId: string };

/**
 * A block as plain text, for places that cannot show media: a list preview,
 * an AI prompt. An image is its alt text; audio is marked, never described.
 */
export function blockAsText(block: ContentBlock): string {
  switch (block.type) {
    case "text":
      return block.text;
    case "math":
      return block.latex;
    case "image":
      return `[صورة: ${block.alt}]`;
    case "audio":
      return "[مقطع صوتي]";
  }
}

/** Every asset the content points at, with where it is, for validation. */
export interface AssetReference {
  assetId: string;
  kind: "IMAGE" | "AUDIO";
  path: string;
}

/** The assets one piece of content points at, with their path under `path`. */
export function richContentAssets(rich: RichContent | null, path: string): AssetReference[] {
  return (rich?.blocks ?? []).flatMap((block, index): AssetReference[] => {
    const at = `${path}.blocks.${index}`;
    if (block.type === "image") return [{ assetId: block.assetId, kind: "IMAGE", path: at }];
    if (block.type === "audio") return [{ assetId: block.assetId, kind: "AUDIO", path: at }];
    return [];
  });
}

export function assetReferences(
  content: Pick<DraftContent, "stem" | "explanation" | "options">,
): AssetReference[] {
  return [
    ...richContentAssets(content.stem, "stem"),
    ...richContentAssets(content.explanation, "explanation"),
    ...content.options.flatMap((option, index) =>
      richContentAssets(option.content, `options.${index}.content`),
    ),
  ];
}

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
  /** A shared reading passage shown above the stem (question_passages); null for most questions. */
  passageId: string | null;
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
