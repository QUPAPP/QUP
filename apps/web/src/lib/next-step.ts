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

/** The verb on the next step's button; the panel's heading already names the step. */
export function nextStepAction(step: NextStep): string {
  switch (step.type) {
    case "RESUME_SESSION":
      return "أكمل الجلسة";
    case "SUBSCRIBE":
      return "عرض الباقات";
    case "REASSESS":
      return "ابدأ إعادة القياس";
    case "TRAIN":
      return "ابدأ التدريب";
    case "ALL_MASTERED":
      return "ملف مهاراتي";
    default:
      return "ابدأ الآن";
  }
}

/** One sentence on why this is the next step, shown under its button label. */
export function nextStepReason(step: NextStep): string {
  switch (step.type) {
    case "RESUME_SESSION":
      return "لديك جلسة لم تكتمل، وإجاباتك المؤكدة فيها محفوظة.";
    case "START_MINI_DIAGNOSTIC":
      return "أسئلة قليلة من أقسام الاختبار تعطيك قراءة أولى لمستواك. التشخيص المصغّر مجاني.";
    case "SUBSCRIBE":
      return "أنهيت التشخيص المصغّر. ملف المهارات الكامل والتدريب وإعادة القياس ضمن باقة هذا الاختبار.";
    case "START_FULL_DIAGNOSTIC":
      return "يقيس كل مهارات الاختبار، ومنه يُبنى ملف مهاراتك وترتيب تدريبك.";
    case "REASSESS":
      return "وصلت هذه المهارة إلى حد إعادة القياس. أثبت إتقانها بأسئلة لم ترها من قبل.";
    case "START_FULL_REASSESSMENT":
      return "تدرّبت بما يكفي لتقيس تقدّمك في كل المهارات من جديد.";
    case "TRAIN":
      return step.skillName
        ? "أحوج مهارة إلى التدريب في ملفك الآن. الجلسة تبدأ بها وتنتقل معك كلما تحسّنت."
        : "جلسة قصيرة من أسئلة مختارة للمهارات التي تحتاجها.";
    case "ALL_MASTERED":
      return "كل مهارات هذا الاختبار متقنة. اختبار محاكٍ يقيس جاهزيتك تحت الوقت.";
  }
}

const POINTS = 100;

/** A mastery gain in percentage points: 0.42 → 0.58 is "+16 نقطة". */
export function improvementText(before: number, after: number): string {
  const points = Math.round((after - before) * POINTS);
  return points >= 1 ? `+${points} نقطة` : "+أقل من نقطة";
}
