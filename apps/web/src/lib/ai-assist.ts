/**
 * Applying AI suggestions to the question editor's form (C3). Applying only
 * changes the form; nothing is saved until the author saves, and the version
 * still goes through review.
 */

import type { AiRunStatus, MetadataSuggestion } from "./ai-api";
import { isApiError } from "./api";
import { type BlockField, DIFFICULTY_PRESETS, type QuestionForm } from "./question-form";

type SuggestedFields = Pick<QuestionForm, "mappings" | "difficulty">;

/**
 * The suggested node becomes the one PRIMARY mapping. A node already mapped
 * keeps its weight and rationale; the previous primary is dropped, other
 * secondary mappings stay.
 */
export function applySuggestion(
  form: SuggestedFields,
  suggestion: MetadataSuggestion,
): SuggestedFields {
  const target = suggestion.skillId
    ? `skill:${suggestion.skillId}`
    : `subskill:${suggestion.subskillId}`;
  const existing = form.mappings.find((mapping) => mapping.target === target);
  const secondaries = form.mappings.filter(
    (mapping) => mapping.role === "SECONDARY" && mapping.target !== target,
  );
  return {
    difficulty: String(suggestion.difficulty),
    mappings: [
      {
        target,
        role: "PRIMARY",
        weight: existing?.weight ?? "",
        rationale: existing?.rationale ?? "",
      },
      ...secondaries,
    ],
  };
}

/** The editor's name for a difficulty value. */
export function difficultyLabel(value: number): string {
  return DIFFICULTY_PRESETS.find((preset) => preset.value === value)?.label ?? `مخصص (${value})`;
}

/** An explanation draft as the editor's explanation field: one text block. */
export function explanationBlocks(text: string): BlockField[] {
  return [{ type: "text", value: text.trim() }];
}

export const AI_ERROR_MESSAGES = {
  AI_UNAVAILABLE: "المساعدة غير متاحة الآن. أكمل السؤال يدويًا وجرّب لاحقًا.",
  AI_OUTPUT_INVALID: "لم تصل إجابة صالحة يمكن عرضها. جرّب مرة أخرى لاحقًا.",
  AI_TIMEOUT: "استغرق الطلب وقتًا أطول من المسموح. جرّب مرة أخرى.",
  AI_REQUIRES_DRAFT: "المساعدة متاحة للمسودات فقط.",
  AI_NO_SKILLS: "لا توجد مهارات نشطة في نسخة التصنيف لاقتراح إحداها.",
  RATE_LIMITED: "طلبات كثيرة خلال دقيقة. انتظر قليلًا ثم جرّب.",
} as const;

/** The Arabic message for an AI error the API answered with; null for anything else. */
export function aiErrorMessage(error: unknown): string | null {
  for (const [code, message] of Object.entries(AI_ERROR_MESSAGES)) {
    if (isApiError(error, code)) return message;
  }
  return null;
}

export const AI_TASK_LABELS: Record<string, string> = {
  suggest_question_metadata: "اقتراح المهارة والصعوبة",
  draft_explanation: "مسودة شرح",
};

export const AI_STATUS_LABELS: Record<AiRunStatus, string> = {
  SUCCEEDED: "نجح",
  INVALID_OUTPUT: "مخرجات غير صالحة",
  TIMED_OUT: "انتهت المهلة",
  FAILED: "تعذّر",
};
