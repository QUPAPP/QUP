import type { RichContent, SessionType } from "./api";

/** The two diagnostics a student takes through the same question runner. */
export type DiagnosticType = Extract<SessionType, "MINI_DIAGNOSTIC" | "FULL_DIAGNOSTIC">;

export const DIAGNOSTIC_TITLES: Record<DiagnosticType, string> = {
  MINI_DIAGNOSTIC: "التشخيص المصغّر",
  FULL_DIAGNOSTIC: "التشخيص الكامل",
};

export const isDiagnostic = (type: SessionType): type is DiagnosticType =>
  type === "MINI_DIAGNOSTIC" || type === "FULL_DIAGNOSTIC";

/** Sessions the question runner plays: both diagnostics and adaptive training. */
export type RunnerType = DiagnosticType | "ADAPTIVE_TRAINING";

export const SESSION_TITLES: Record<RunnerType, string> = {
  ...DIAGNOSTIC_TITLES,
  ADAPTIVE_TRAINING: "التدريب التكيفي",
};

export const isRunnable = (type: SessionType): type is RunnerType =>
  isDiagnostic(type) || type === "ADAPTIVE_TRAINING";

/** The last button of a session names where it leads (see completionHref). */
export const COMPLETION_LABELS: Record<RunnerType, string> = {
  MINI_DIAGNOSTIC: "عرض النتيجة",
  FULL_DIAGNOSTIC: "عرض ملف مهاراتي",
  ADAPTIVE_TRAINING: "عرض ملف مهاراتي",
};

/**
 * Where a finished session leads: the mini diagnostic to its preliminary
 * result; the full diagnostic and training to the skill profile they update
 * (PRD §6).
 */
export function completionHref(session: { id: string; examId: string; type: RunnerType }) {
  return session.type === "MINI_DIAGNOSTIC"
    ? `/assessments/${session.id}/result`
    : `/exams/${session.examId}/profile`;
}

/** The options a training review marks as correct, in the order the question shows them. */
export function correctOptions<T extends { key: string; content: RichContent }>(
  options: readonly T[],
  correctKeys: readonly string[],
): T[] {
  return options.filter((option) => correctKeys.includes(option.key));
}
