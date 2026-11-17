import type { MockReviewItem } from "./api";

export type ReviewFilter = "WRONG" | "NOT_ANSWERED" | "ALL";

export function reviewFilterMatches(outcome: MockReviewItem["outcome"], filter: ReviewFilter) {
  if (filter === "ALL") return true;
  if (filter === "WRONG") return outcome === "INCORRECT";
  return outcome === "NOT_ANSWERED";
}

const MS_PER_MINUTE = 60_000;

/** How long the exam took, in whole minutes; null when either end is unknown. */
export function durationText(startedAt: string | null, completedAt: string | null): string | null {
  if (!startedAt || !completedAt) return null;
  const minutes = Math.round(
    (new Date(completedAt).getTime() - new Date(startedAt).getTime()) / MS_PER_MINUTE,
  );
  if (minutes < 1) return "أقل من دقيقة";
  if (minutes === 1) return "دقيقة واحدة";
  if (minutes === 2) return "دقيقتان";
  return minutes <= 10 ? `${minutes} دقائق` : `${minutes} دقيقة`;
}
