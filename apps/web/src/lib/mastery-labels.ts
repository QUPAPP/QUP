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
