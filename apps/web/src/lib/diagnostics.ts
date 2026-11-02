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
  | "FULL_REASSESSMENT"
  | "MOCK_EXAM";

export const SESSION_TITLES: Record<RunnerType, string> = {
  ...DIAGNOSTIC_TITLES,
  ADAPTIVE_TRAINING: "التدريب التكيفي",
  SKILL_REASSESSMENT: "إعادة قياس المهارة",
  FULL_REASSESSMENT: "إعادة التشخيص الشامل",
  MOCK_EXAM: "الاختبار المحاكي",
};

export const isRunnable = (type: SessionType): type is RunnerType =>
  isDiagnostic(type) ||
  type === "ADAPTIVE_TRAINING" ||
  type === "SKILL_REASSESSMENT" ||
  type === "FULL_REASSESSMENT" ||
  type === "MOCK_EXAM";

/** The last button of a session names where it leads (see completionHref). */
export const COMPLETION_LABELS: Record<RunnerType, string> = {
  MINI_DIAGNOSTIC: "عرض النتيجة",
  FULL_DIAGNOSTIC: "عرض ملف مهاراتي",
  ADAPTIVE_TRAINING: "عرض ملف مهاراتي",
  SKILL_REASSESSMENT: "عرض النتيجة",
  FULL_REASSESSMENT: "عرض المقارنة",
  MOCK_EXAM: "عرض النتيجة",
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
    case "MOCK_EXAM":
      return `/assessments/${session.id}/mock-result`;
    default:
      return `/exams/${session.examId}/profile`;
  }
}

const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;

/** Remaining time on a mock exam clock, as m:ss or h:mm:ss with Western digits. */
export function formatCountdown(remainingMs: number): string {
  const total = Math.max(0, Math.ceil(remainingMs / MS_PER_SECOND));
  const hours = Math.floor(total / (SECONDS_PER_MINUTE * SECONDS_PER_MINUTE));
  const minutes = Math.floor(total / SECONDS_PER_MINUTE) % SECONDS_PER_MINUTE;
  const seconds = total % SECONDS_PER_MINUTE;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** The options a training review marks as correct, in the order the question shows them. */
export function correctOptions<T extends { key: string; content: RichContent }>(
  options: readonly T[],
  correctKeys: readonly string[],
): T[] {
  return options.filter((option) => correctKeys.includes(option.key));
}

const OPTION_LETTERS = ["أ", "ب", "ج", "د", "هـ", "و", "ز", "ح"];
const LATIN_OPTION_KEYS = "abcdefgh";
const ARABIC_KEYBOARD_LETTERS = ["أ", "ب", "ج", "د", "ه", "و", "ز", "ح"];
const ARABIC_DIGITS = "١٢٣٤٥٦٧٨";

export function optionLetter(index: number): string {
  return OPTION_LETTERS[index] ?? String(index + 1);
}

export function optionIndexForKey(key: string, optionCount: number): number | null {
  const normalized = key === "ا" || key === "إ" || key === "آ" ? "أ" : key.toLowerCase();
  const candidates = [
    "12345678".indexOf(normalized),
    ARABIC_DIGITS.indexOf(normalized),
    normalized.length === 1 ? LATIN_OPTION_KEYS.indexOf(normalized) : -1,
    ARABIC_KEYBOARD_LETTERS.indexOf(normalized),
  ];
  const index = candidates.find((candidate) => candidate >= 0);
  return index !== undefined && index < optionCount ? index : null;
}
