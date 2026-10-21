import type { FullReassessmentGateValue } from "../../settings/settings.contract.js";
import type { ItemOutcome, MeasuredItem } from "./preliminary-result.js";

/**
 * The full re-diagnostic (PRD §6 "Full Re-Diagnostic when eligible", §8,
 * WORKFLOWS.md §6). Pure: the caller supplies the clock, the counts and the
 * gate setting. Assumed details: OPEN_QUESTIONS.md #12g.
 */

const MS_PER_DAY = 86_400_000;

export type FullReassessmentState =
  /** An unfinished re-diagnostic: always resumable. */
  | "OPEN"
  | "REQUIRES_ACCESS"
  /** No full measurement yet: the full diagnostic comes first. */
  | "FULL_DIAGNOSTIC_REQUIRED"
  /** The cooldown has not ended, or training answers are missing. */
  | "WAITING"
  | "ELIGIBLE";

export interface FullReassessmentStatus {
  state: FullReassessmentState;
  /** When the cooldown ends; null without a full measurement. */
  availableAt: Date | null;
  attemptsRemaining: number;
}

export function fullReassessmentStatus(input: {
  hasAccess: boolean;
  openSessionId: string | null;
  /** Completion of the latest full diagnostic or full re-diagnostic. */
  lastMeasuredAt: Date | null;
  /** Answered training attempts since then. */
  trainingAttemptsSince: number;
  now: Date;
  gate: FullReassessmentGateValue;
}): FullReassessmentStatus {
  const attemptsRemaining = Math.max(
    0,
    input.gate.minTrainingAttempts - input.trainingAttemptsSince,
  );
  const availableAt = input.lastMeasuredAt
    ? new Date(input.lastMeasuredAt.getTime() + input.gate.cooldownDays * MS_PER_DAY)
    : null;
  const status = (state: FullReassessmentState) => ({ state, availableAt, attemptsRemaining });

  if (input.openSessionId !== null) return status("OPEN");
  if (!input.hasAccess) return status("REQUIRES_ACCESS");
  if (availableAt === null) return status("FULL_DIAGNOSTIC_REQUIRED");
  if (input.now < availableAt || attemptsRemaining > 0) return status("WAITING");
  return status("ELIGIBLE");
}

export interface SkillComparison {
  skillId: string;
  correct: number;
  total: number;
  /** Null when there is no previous measurement at all. */
  previousCorrect: number | null;
  previousTotal: number | null;
}

export interface MeasurementComparison {
  score: { correct: number; total: number };
  previous: { correct: number; total: number } | null;
  /** Skills of this measurement in the order met, then those measured only before. */
  skills: SkillComparison[];
}

type Tally = { correct: number; total: number };

function tally(items: readonly MeasuredItem[]): { overall: Tally; perSkill: Map<string, Tally> } {
  const overall = { correct: 0, total: 0 };
  const perSkill = new Map<string, Tally>();
  const isCorrect = (outcome: ItemOutcome) => (outcome === "CORRECT" ? 1 : 0);
  for (const item of items) {
    const skill = perSkill.get(item.skillId) ?? { correct: 0, total: 0 };
    skill.correct += isCorrect(item.outcome);
    skill.total += 1;
    perSkill.set(item.skillId, skill);
    overall.correct += isCorrect(item.outcome);
    overall.total += 1;
  }
  return { overall, perSkill };
}

/**
 * Correct answers out of all items, overall and per skill, now and at the
 * previous full measurement. Skipped and unanswered items are not correct.
 */
export function compareMeasurements(
  current: readonly MeasuredItem[],
  previous: readonly MeasuredItem[] | null,
): MeasurementComparison {
  const now = tally(current);
  const before = previous ? tally(previous) : null;
  const skillIds = [...now.perSkill.keys()];
  for (const skillId of before?.perSkill.keys() ?? []) {
    if (!now.perSkill.has(skillId)) skillIds.push(skillId);
  }
  return {
    score: now.overall,
    previous: before?.overall ?? null,
    skills: skillIds.map((skillId) => {
      const current = now.perSkill.get(skillId) ?? { correct: 0, total: 0 };
      const earlier = before ? (before.perSkill.get(skillId) ?? { correct: 0, total: 0 }) : null;
      return {
        skillId,
        correct: current.correct,
        total: current.total,
        previousCorrect: earlier?.correct ?? null,
        previousTotal: earlier?.total ?? null,
      };
    }),
  };
}
