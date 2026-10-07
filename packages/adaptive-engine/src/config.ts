/**
 * Mastery Engine configuration (ADAPTIVE_ENGINE.md).
 *
 * Every number the engine uses lives here, versioned, never inline in the
 * calculation ("الثابت 8 ضمن Config Version وليس magic number في الكود", §3).
 * Changing any value means a new `configVersion`; each mastery event records
 * the version it was computed with, so history stays explainable and can be
 * replayed (§24).
 */

export const ALGORITHM_VERSION = "mastery-v1.0";

export interface MasteryConfig {
  configVersion: string;

  /** §2 — Beta-style prior. */
  prior: { alpha: number; beta: number };

  /** §3 — confidence = 1 − exp(−E / confidenceScale). */
  confidenceScale: number;

  /** §5 — basePositive = base + perDifficulty × difficulty. */
  positive: { base: number; perDifficulty: number };
  /** §6 — baseNegative = base − perDifficulty × difficulty. */
  negative: { base: number; perDifficulty: number };

  /** §8 — multipliers on positive evidence. */
  hint: { none: number; used: number; answerRevealed: number };

  /**
   * §9 — damping for re-answering the same logical question. `withinDays` are
   * upper bounds in days since the previous attempt, checked in order; older
   * or first-time attempts use `fresh`.
   */
  repeat: { fresh: number; bands: readonly { withinDays: number; factor: number }[] };

  /** §10 — timeout multiplies negative evidence; skip yields no evidence. */
  timeoutFactor: number;

  /** §12 — state thresholds. */
  states: {
    /** Below this confidence the estimate is UNCERTAIN. */
    minConfidence: number;
    /** Below this mastery (with enough confidence) the node is a GAP. */
    gapMasteryBelow: number;
    /** Default node mastery threshold when the taxonomy sets none. */
    defaultMasteryThreshold: number;
    /** Confidence needed to be READY_FOR_REASSESSMENT. */
    readyConfidence: number;
    /** Coverage needed to be READY_FOR_REASSESSMENT (OPEN_QUESTIONS.md #12b). */
    requiredCoverage: number;
  };
}

/** The V1 baseline, exactly as specified in ADAPTIVE_ENGINE.md. */
export const MASTERY_CONFIG_V1: MasteryConfig = Object.freeze({
  configVersion: "mastery-config-v1.0",
  prior: { alpha: 2, beta: 2 },
  confidenceScale: 8,
  positive: { base: 0.75, perDifficulty: 0.75 },
  negative: { base: 1.5, perDifficulty: 0.75 },
  hint: { none: 1, used: 0.6, answerRevealed: 0 },
  repeat: {
    fresh: 1,
    bands: [
      { withinDays: 7, factor: 0.35 },
      { withinDays: 30, factor: 0.7 },
    ],
  },
  timeoutFactor: 0.5,
  states: {
    minConfidence: 0.55,
    gapMasteryBelow: 0.7,
    defaultMasteryThreshold: 0.85,
    readyConfidence: 0.75,
    requiredCoverage: 1,
  },
});
