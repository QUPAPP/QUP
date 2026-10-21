import type { RichContent, SessionType } from "./api";

/** The two diagnostics a student takes through the same question runner. */
export type DiagnosticType = Extract<SessionType, "MINI_DIAGNOSTIC" | "FULL_DIAGNOSTIC">;

export const DIAGNOSTIC_TITLES: Record<DiagnosticType, string> = {
  MINI_DIAGNOSTIC: "التشخيص المصغّر",
  FULL_DIAGNOSTIC: "التشخيص الكامل",
};

export const isDiagnostic = (type: SessionType): type is DiagnosticType =>
  type === "MINI_DIAGNOSTIC" || type === "FULL_DIAGNOSTIC";

/** Sessions the question runner plays: diagnostics, training and both reassessments. */
export type RunnerType =
  | DiagnosticType
  | "ADAPTIVE_TRAINING"
  | "SKILL_REASSESSMENT"
  | "FULL_REASSESSMENT";

export const SESSION_TITLES: Record<RunnerType, string> = {
  ...DIAGNOSTIC_TITLES,
  ADAPTIVE_TRAINING: "التدريب التكيفي",
  SKILL_REASSESSMENT: "إعادة قياس المهارة",
  FULL_REASSESSMENT: "إعادة التشخيص الشامل",
};

export const isRunnable = (type: SessionType): type is RunnerType =>
  isDiagnostic(type) ||
  type === "ADAPTIVE_TRAINING" ||
  type === "SKILL_REASSESSMENT" ||
  type === "FULL_REASSESSMENT";

/** The last button of a session names where it leads (see completionHref). */
export const COMPLETION_LABELS: Record<RunnerType, string> = {
  MINI_DIAGNOSTIC: "عرض النتيجة",
  FULL_DIAGNOSTIC: "عرض ملف مهاراتي",
  ADAPTIVE_TRAINING: "عرض ملف مهاراتي",
  SKILL_REASSESSMENT: "عرض النتيجة",
  FULL_REASSESSMENT: "عرض المقارنة",
};

/**
 * Where a finished session leads: the mini diagnostic and both reassessments
 * to their own result; the full diagnostic and training to the skill profile
 * they update (PRD §6).
 */
export function completionHref(session: { id: string; examId: string; type: RunnerType }) {
  switch (session.type) {
    case "MINI_DIAGNOSTIC":
      return `/assessments/${session.id}/result`;
    case "SKILL_REASSESSMENT":
      return `/assessments/${session.id}/reassessment`;
    case "FULL_REASSESSMENT":
      return `/assessments/${session.id}/full-reassessment`;
    default:
      return `/exams/${session.examId}/profile`;
  }
}

/** The options a training review marks as correct, in the order the question shows them. */
export function correctOptions<T extends { key: string; content: RichContent }>(
  options: readonly T[],
  correctKeys: readonly string[],
): T[] {
  return options.filter((option) => correctKeys.includes(option.key));
}
