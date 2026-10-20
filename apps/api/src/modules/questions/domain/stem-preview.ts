import type { RichContent } from "./question-content.js";

/** Long enough to tell questions apart in a list, short enough for one row. */
export const STEM_PREVIEW_LENGTH = 140;

const MATH_PLACEHOLDER = "[…]";
const ELLIPSIS = "…";

/**
 * One line describing a stem for admin lists: text blocks joined by a space,
 * math as a placeholder (its source reads poorly out of context), whitespace
 * collapsed, cut with an ellipsis. Plain text only — the list never renders
 * question content as markup.
 */
export function stemPreview(stem: RichContent, maxLength = STEM_PREVIEW_LENGTH): string {
  const line = stem.blocks
    .map((block) => (block.type === "text" ? block.text : MATH_PLACEHOLDER))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return line.length <= maxLength ? line : `${line.slice(0, maxLength - 1)}${ELLIPSIS}`;
}
