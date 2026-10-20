/**
 * Skill reassessment (ADAPTIVE_ENGINE.md §12–§13, WORKFLOWS.md §5): the short
 * check that turns READY_FOR_REASSESSMENT into MASTERED. Pure; the caller
 * counts answers and evidence. Assumed details: OPEN_QUESTIONS.md #12e.
 */

export interface ReassessmentConfig {
  configVersion: string;
  /** §13 — questions in one reassessment. */
  questionCount: number;
  /** §13 — share of correct answers needed ("at least 4/5"). */
  passRatio: number;
  /** §13 — answers with evidence needed after a failure before the next try. */
  retryAfterAttempts: number;
}

export const REASSESSMENT_CONFIG_V1: ReassessmentConfig = Object.freeze({
  configVersion: "reassessment-config-v1.0",
  questionCount: 5,
  passRatio: 0.8,
  retryAfterAttempts: 5,
});

/** Correct answers needed out of `total`; never 0, never more than all. */
export function requiredCorrect(total: number, config: ReassessmentConfig): number {
  return Math.min(total, Math.max(1, Math.ceil(config.passRatio * total)));
}

/**
 * §13 "pass at least 4/5 plus final conditions": enough correct answers, and
 * the skill still meets readiness (threshold, confidence, coverage) once the
 * reassessment's own evidence is applied.
 */
export function reassessmentPassed(
  input: { correct: number; total: number; readyAfter: boolean },
  config: ReassessmentConfig,
): boolean {
  return input.readyAfter && input.correct >= requiredCorrect(input.total, config);
}

/**
 * After a failed reassessment the skill reads DEVELOPING until enough new
 * answers carry evidence (§13: "5 new eligible attempts before retry").
 * Returns how many are still needed, or null when there is no hold.
 */
export function holdRemaining(
  input: { failed: boolean; attemptsSince: number },
  config: ReassessmentConfig,
): number | null {
  if (!input.failed) return null;
  const remaining = config.retryAfterAttempts - input.attemptsSince;
  return remaining > 0 ? remaining : null;
}
