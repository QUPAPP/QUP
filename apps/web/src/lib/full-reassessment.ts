/**
 * Wording for the full re-diagnostic (PRD §8). Every number comes from the
 * API: the gate, what is left, and the comparison. This only phrases them.
 */

import type { FullReassessmentResult, FullReassessmentStatus } from "./api";
import { answersText } from "./mastery-labels";

const DAY_MS = 86_400_000;
const PERCENT = 100;
/** Arabic counted nouns: 3–10 take the plural, 11 and above the singular. */
const PLURAL_UP_TO = 10;

/** A number of days, as it reads after "بعد". */
export function daysText(days: number): string {
  if (days === 1) return "يوم واحد";
  if (days === 2) return "يومين";
  return days <= PLURAL_UP_TO ? `${days} أيام` : `${days} يومًا`;
}

function pointsText(points: number): string {
  if (points === 1) return "نقطة";
  if (points === 2) return "نقطتان";
  return points <= PLURAL_UP_TO ? "نقاط" : "نقطة";
}

/** The admin's gate as one sentence; empty when there is none. */
export function gateText(cooldownDays: number, minTrainingAttempts: number): string {
  const days = `بعد مرور ${daysText(cooldownDays)} على آخر قياس كامل`;
  if (cooldownDays > 0 && minTrainingAttempts > 0) {
    return `تُتاح ${days}، ويلزم معها ${answersText(minTrainingAttempts)} في التدريب منذه.`;
  }
  if (cooldownDays > 0) return `تُتاح ${days}.`;
  if (minTrainingAttempts > 0) {
    return `يلزم ${answersText(minTrainingAttempts)} في التدريب منذ آخر قياس كامل.`;
  }
  return "";
}

/** What still stands between the student and the re-diagnostic, one line per condition. */
export function waitingLines(
  status: Pick<FullReassessmentStatus, "availableAt" | "trainingAttempts">,
  now: Date,
): string[] {
  const lines: string[] = [];
  const waitMs = status.availableAt ? new Date(status.availableAt).getTime() - now.getTime() : 0;
  if (waitMs > 0) lines.push(`تُفتح بعد ${daysText(Math.ceil(waitMs / DAY_MS))} من الآن.`);
  const remaining = status.trainingAttempts.required - status.trainingAttempts.done;
  if (remaining > 0) {
    const verb = remaining <= PLURAL_UP_TO ? "بقيت" : "بقي";
    lines.push(`${verb} ${answersText(remaining)} في التدريب.`);
  }
  return lines;
}

export function accuracyText(correct: number, total: number): string {
  return total === 0 ? "—" : `${Math.round((correct / total) * PERCENT)}٪`;
}

/** The change in accuracy between the two measurements, in percentage points. */
export function changeText(
  skill: Pick<
    FullReassessmentResult["skills"][number],
    "correct" | "total" | "previousCorrect" | "previousTotal"
  >,
): string {
  if (skill.total === 0) return "لم تُقس هذه المرة";
  if (!skill.previousTotal || skill.previousCorrect === null) return "قيست لأول مرة";
  const points = Math.round(
    (skill.correct / skill.total - skill.previousCorrect / skill.previousTotal) * PERCENT,
  );
  if (points === 0) return "دون تغيير";
  return points > 0 ? `+${points} ${pointsText(points)}` : `−${-points} ${pointsText(-points)}`;
}
