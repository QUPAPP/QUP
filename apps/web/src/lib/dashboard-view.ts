import type { MasteryState, SkillProfile } from "./api";

/**
 * Presentation helpers for the dashboard. They only reshape what the API
 * returned; no mastery rule lives here (AGENTS.md §6).
 */

/** "ريم العتيبي" → "ريم". Null when there is no usable name. */
export function firstName(displayName: string | null | undefined): string | null {
  return displayName?.trim().split(/\s+/)[0] || null;
}

export type SkillStateKey = "mastered" | "ready" | "developing" | "gap" | "unassessed";

/**
 * The exam's skills split by state, in the order a student moves through them
 * read backwards: done first, not yet measured last. "developing" is whatever
 * was measured but is neither mastered, ready nor a gap. Counts never go below
 * zero, so an inconsistent summary still draws.
 */
export function skillStateSegments(
  summary: SkillProfile["summary"],
): { key: SkillStateKey; label: string; count: number }[] {
  const measuredOther =
    summary.assessed - summary.mastered - summary.readyForReassessment - summary.gaps;
  return [
    { key: "mastered", label: "متقنة", count: summary.mastered },
    { key: "ready", label: "جاهزة لإعادة القياس", count: summary.readyForReassessment },
    { key: "developing", label: "قيد التحسّن", count: Math.max(0, measuredOther) },
    { key: "gap", label: "فجوات", count: summary.gaps },
    {
      key: "unassessed",
      label: "لم تُقس بعد",
      count: Math.max(0, summary.skills - summary.assessed),
    },
  ];
}

/** Which tile a mastery state draws as. UNCERTAIN was measured but too thinly to call: it reads as developing. */
export function tileState(state: MasteryState): SkillStateKey {
  switch (state) {
    case "MASTERED":
      return "mastered";
    case "READY_FOR_REASSESSMENT":
      return "ready";
    case "GAP":
      return "gap";
    case "UNASSESSED":
      return "unassessed";
    default:
      return "developing";
  }
}
