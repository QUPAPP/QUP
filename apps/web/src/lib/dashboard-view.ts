import type { SkillProfile } from "./api";

/**
 * Presentation helpers for the dashboard. They only reshape what the API
 * returned; no mastery rule lives here (AGENTS.md §6).
 */

/** Share of the exam's skills the diagnostics have measured so far, 0..1. */
export function coverageShare(summary: SkillProfile["summary"]): number {
  if (summary.skills <= 0) return 0;
  return Math.min(1, summary.assessed / summary.skills);
}

/** "ريم العتيبي" → "ريم". Null when there is no usable name. */
export function firstName(displayName: string | null | undefined): string | null {
  return displayName?.trim().split(/\s+/)[0] || null;
}
