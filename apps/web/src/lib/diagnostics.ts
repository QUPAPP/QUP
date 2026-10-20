import type { SessionType } from "./api";

/** The two diagnostics a student takes through the same question runner. */
export type DiagnosticType = Extract<SessionType, "MINI_DIAGNOSTIC" | "FULL_DIAGNOSTIC">;

export const DIAGNOSTIC_TITLES: Record<DiagnosticType, string> = {
  MINI_DIAGNOSTIC: "التشخيص المصغّر",
  FULL_DIAGNOSTIC: "التشخيص الكامل",
};

export const isDiagnostic = (type: SessionType): type is DiagnosticType =>
  type === "MINI_DIAGNOSTIC" || type === "FULL_DIAGNOSTIC";

/**
 * Where a finished diagnostic leads: the mini one to its preliminary result,
 * the full one to the skill profile it fills in (PRD §6).
 */
export function completionHref(session: { id: string; examId: string; type: DiagnosticType }) {
  return session.type === "FULL_DIAGNOSTIC"
    ? `/exams/${session.examId}/profile`
    : `/assessments/${session.id}/result`;
}
