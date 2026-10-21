import type { NextStep } from "./api";
import { isRunnable, SESSION_TITLES } from "./diagnostics";

/**
 * Where the dashboard's primary button goes for the server's next step. The
 * choice itself is the API's (OPEN_QUESTIONS.md #12f); this only names it.
 */
export function nextStepLink(step: NextStep, examId: string): { href: string; label: string } {
  switch (step.type) {
    case "RESUME_SESSION":
      return {
        href: `/assessments/${step.sessionId}`,
        label: isRunnable(step.sessionType)
          ? `أكمل ${SESSION_TITLES[step.sessionType]}`
          : "أكمل جلستك",
      };
    case "START_MINI_DIAGNOSTIC":
      return { href: `/exams/${examId}/diagnostic`, label: "ابدأ التشخيص المصغّر" };
    case "SUBSCRIBE":
      return { href: "/subscriptions", label: "اشترك لتكمل رحلتك" };
    case "START_FULL_DIAGNOSTIC":
      return { href: `/exams/${examId}/full-diagnostic`, label: "ابدأ التشخيص الكامل" };
    case "REASSESS":
      return {
        href: `/exams/${examId}/skills/${step.skillId}/reassessment`,
        label: `أعد قياس: ${step.skillName}`,
      };
    case "START_FULL_REASSESSMENT":
      return { href: `/exams/${examId}/full-reassessment`, label: "ابدأ إعادة التشخيص الشامل" };
    case "TRAIN":
      return {
        href: `/exams/${examId}/training`,
        label: step.skillName ? `تدرّب على: ${step.skillName}` : "ابدأ التدريب",
      };
    case "ALL_MASTERED":
      return { href: `/exams/${examId}/profile`, label: "أتقنت كل المهارات — ملف مهاراتي" };
  }
}

const POINTS = 100;

/** A mastery gain in percentage points: 0.42 → 0.58 is "+16 نقطة". */
export function improvementText(before: number, after: number): string {
  const points = Math.round((after - before) * POINTS);
  return points >= 1 ? `+${points} نقطة` : "+أقل من نقطة";
}
