import type { PreliminaryResultReport } from "../application/assessments.service.js";
import type {
  DiagnosticLevel,
  StrengthRating,
  WeaknessRating,
} from "../domain/preliminary-result.js";

/**
 * Student-facing wording (OPEN_QUESTIONS.md #10b). The domain speaks in codes;
 * the Arabic lives here, at the edge. Each value is sent as `{ code, label }`
 * so a client can show the label as-is or key its own copy off the code.
 *
 * "Diagnostic level" on purpose: it is not a predicted exam score.
 */
const LEVEL_LABELS: Record<DiagnosticLevel, string> = {
  NEEDS_FOUNDATION: "يحتاج تأسيس",
  BEGINNER: "مبتدئ",
  INTERMEDIATE: "متوسط",
  GOOD: "جيد",
  ADVANCED: "متقدم",
};

const RATING_LABELS: Record<StrengthRating | WeaknessRating, string> = {
  VERY_GOOD: "جيد جدًا",
  GOOD: "جيد",
  NEEDS_TRAINING: "يحتاج تدريب",
};

const SUBSCRIBE_MESSAGE =
  "هذه قراءة أولية لمستواك. التشخيص الكامل في QUP يكشف الفواقد التعليمية بالتفصيل ويحدد لك ما تحتاج إلى تدريبه.";

const toSkillView = (entry: { skillName: string; rating: StrengthRating | WeaknessRating }) => ({
  skill: entry.skillName,
  rating: { code: entry.rating, label: RATING_LABELS[entry.rating] },
});

/**
 * Built field by field, like `toStudentQuestionView`: nothing reaches the
 * student unless it is named here, so a field added to the report later
 * cannot leak into the free preview by default.
 */
export function toPreliminaryResultView(report: PreliminaryResultReport) {
  return {
    kind: "PRELIMINARY" as const,
    score: {
      correct: report.score.correct,
      total: report.score.total,
      percentage: report.score.percentage,
    },
    level: { code: report.level, label: LEVEL_LABELS[report.level] },
    strengths: report.strengths.map(toSkillView),
    weaknesses: report.weaknesses.map(toSkillView),
    // The invitation to subscribe is for students who have not: null once they have access.
    nextStep: report.hasFullAccess
      ? null
      : { type: "SUBSCRIBE" as const, message: SUBSCRIBE_MESSAGE },
  };
}
