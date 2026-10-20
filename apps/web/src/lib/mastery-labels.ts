import type { MasteryState } from "./api";

/** How each mastery state reads to a student (ADAPTIVE_ENGINE.md §12). Display only. */
export const MASTERY_STATE_LABELS: Record<MasteryState, string> = {
  UNASSESSED: "لم تُقَس بعد",
  UNCERTAIN: "تحتاج قياسًا أكثر",
  GAP: "فجوة",
  DEVELOPING: "قيد التحسّن",
  READY_FOR_REASSESSMENT: "جاهزة لإعادة القياس",
  MASTERED: "متقنة",
};

const PERCENT = 100;

/** Coverage as words: how much of the skill's required questions the student has met. */
export function coverageText(coverage: number): string {
  if (coverage <= 0) return "لم تُغطَّ بعد";
  if (coverage >= 1) return "مغطاة بالكامل";
  return `مغطاة ${Math.round(coverage * PERCENT)}٪`;
}

export function percentText(share: number): string {
  return `${Math.round(share * PERCENT)}٪`;
}

const DUAL = 2;
const PLURAL_UP_TO = 10;

/** "إجابة واحدة", "إجابتان", "5 إجابات", "11 إجابة" — Arabic counts the noun by number. */
export function answersText(count: number): string {
  if (count === 1) return "إجابة واحدة";
  if (count === DUAL) return "إجابتان";
  return count <= PLURAL_UP_TO ? `${count} إجابات` : `${count} إجابة`;
}
