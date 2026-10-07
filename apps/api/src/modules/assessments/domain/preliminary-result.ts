/**
 * The preliminary result of a mini diagnostic — what a student sees before
 * paying (PRD §7, OPEN_QUESTIONS.md #10b). Deliberately a small preview: a
 * score, a diagnostic level, and a few skills. Never the full skill map.
 *
 * Pure: the same items and config always give the same result. It summarizes
 * one session and makes no mastery decision — that is the Mastery Engine's.
 */

export type DiagnosticLevel =
  | "NEEDS_FOUNDATION"
  | "BEGINNER"
  | "INTERMEDIATE"
  | "GOOD"
  | "ADVANCED";

export type StrengthRating = "VERY_GOOD" | "GOOD";
export type WeaknessRating = "NEEDS_TRAINING";

export interface LevelBand {
  level: DiagnosticLevel;
  /** Lowest performance percentage (whole number, 0–100) that earns this level. */
  fromPercentage: number;
}

export interface PreliminaryResultConfig {
  /** Ascending by `fromPercentage`; the first band starts at 0 so every score has a level. */
  levels: readonly LevelBand[];
  /** Accuracy within a skill, 0–1. Below `goodFromAccuracy` the skill needs training. */
  skillRatings: { veryGoodFromAccuracy: number; goodFromAccuracy: number };
  maxStrengths: number;
  maxWeaknesses: number;
}

export type ItemOutcome = "CORRECT" | "INCORRECT" | "NOT_ANSWERED";

export interface MeasuredItem {
  /** The skill the question primarily measures. */
  skillId: string;
  outcome: ItemOutcome;
}

export interface PreliminaryResult {
  score: { correct: number; total: number; percentage: number };
  level: DiagnosticLevel;
  strengths: { skillId: string; rating: StrengthRating }[];
  /** Most in need of training first. */
  weaknesses: { skillId: string; rating: WeaknessRating }[];
}

interface SkillTally {
  skillId: string;
  answered: number;
  correct: number;
}

const PERCENT = 100;

/** `items` in the order the student met them: ties between skills keep that order. */
export function summarizePreliminaryResult(
  items: readonly MeasuredItem[],
  config: PreliminaryResultConfig,
): PreliminaryResult {
  const correct = items.filter((i) => i.outcome === "CORRECT").length;
  // An unanswered question counts against the score, as it would in the exam.
  const percentage = items.length === 0 ? 0 : Math.round((correct * PERCENT) / items.length);

  const skills = measuredSkills(items);
  const { goodFromAccuracy, veryGoodFromAccuracy } = config.skillRatings;
  const isStrength = (t: SkillTally) => accuracy(t) >= goodFromAccuracy;

  const strengths = skills
    .filter(isStrength)
    .sort((a, b) => compareAccuracy(b, a) || b.correct - a.correct)
    .slice(0, config.maxStrengths)
    .map((t) => ({
      skillId: t.skillId,
      rating: accuracy(t) >= veryGoodFromAccuracy ? ("VERY_GOOD" as const) : ("GOOD" as const),
    }));

  const weaknesses = skills
    .filter((t) => !isStrength(t))
    .sort((a, b) => compareAccuracy(a, b) || incorrect(b) - incorrect(a))
    .slice(0, config.maxWeaknesses)
    .map((t) => ({ skillId: t.skillId, rating: "NEEDS_TRAINING" as const }));

  return {
    score: { correct, total: items.length, percentage },
    // From the percentage the student is shown, so the two can never disagree.
    level: levelFor(percentage, config.levels),
    strengths,
    weaknesses,
  };
}

export function levelFor(percentage: number, levels: readonly LevelBand[]): DiagnosticLevel {
  const band = levels.findLast((b) => percentage >= b.fromPercentage);
  if (!band) throw new Error("Diagnostic level bands must start at 0.");
  return band.level;
}

/**
 * Skills with at least one answered question, in order of first answer. A
 * skipped question measures nothing (ADAPTIVE_ENGINE.md §10: a skip is not
 * evidence), so a skill the student only skipped is not reported at all.
 */
function measuredSkills(items: readonly MeasuredItem[]): SkillTally[] {
  const tallies = new Map<string, SkillTally>();
  for (const item of items) {
    if (item.outcome === "NOT_ANSWERED") continue;
    const tally = tallies.get(item.skillId) ?? { skillId: item.skillId, answered: 0, correct: 0 };
    tally.answered += 1;
    if (item.outcome === "CORRECT") tally.correct += 1;
    tallies.set(item.skillId, tally);
  }
  return [...tallies.values()];
}

const accuracy = (t: SkillTally) => t.correct / t.answered;
const incorrect = (t: SkillTally) => t.answered - t.correct;

/** Cross-multiplied, so equal fractions (1/2, 2/4) compare equal without float error. */
const compareAccuracy = (a: SkillTally, b: SkillTally) =>
  a.correct * b.answered - b.correct * a.answered;
