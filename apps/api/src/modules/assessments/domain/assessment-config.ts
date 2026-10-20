/**
 * Assessment defaults. Versioned like the mastery config: each session records
 * the scoring version it ran under.
 */

import { DEFAULT_PRELIMINARY_LEVELS } from "../../settings/settings.contract.js";
import type { PreliminaryResultConfig } from "./preliminary-result.js";

export const SCORING_VERSION = "scoring-v1";

export const MINI_DIAGNOSTIC_DEFAULTS = Object.freeze({
  /** OPEN_QUESTIONS.md #10 (decided 2026-09-28): 12 unless the exam's blueprint says otherwise. */
  questionCount: 12,
  /**
   * With no evidence yet, every student sits at the prior (mastery 0.5), so
   * the most informative first questions are of middling difficulty
   * (ADAPTIVE_ENGINE.md §17: target difficulty tracks mastery).
   */
  targetDifficulty: 0.5,
});

/**
 * OPEN_QUESTIONS.md #9a (assumed, awaiting the product owner): the full
 * diagnostic asks 40 questions in total, the ones already answered included,
 * at the same middling difficulty as the mini diagnostic (fixed form; adaptive
 * selection is B3). An exam's active FULL_DIAGNOSTIC blueprint overrides the size.
 */
export const FULL_DIAGNOSTIC_DEFAULTS = Object.freeze({
  questionCount: 40,
  targetDifficulty: MINI_DIAGNOSTIC_DEFAULTS.targetDifficulty,
});

/** OPEN_QUESTIONS.md #12d (assumed): a training session is 10 questions, chosen one at a time. */
export const TRAINING_DEFAULTS = Object.freeze({ questionCount: 10 });

/**
 * OPEN_QUESTIONS.md #10b (decided 2026-10-04): the level comes from the
 * performance percentage; at most 2 strengths and 3 weaknesses are shown.
 * The numbers themselves are defaults awaiting confirmation (#10c). They are
 * passed to the calculation as config so the admin panel can supply its own
 * later without touching the logic.
 */
export const PRELIMINARY_RESULT_DEFAULTS: PreliminaryResultConfig = Object.freeze({
  // The boundaries are an admin setting (settings module, C1); this is its version-0 default.
  levels: DEFAULT_PRELIMINARY_LEVELS,
  skillRatings: Object.freeze({ veryGoodFromAccuracy: 0.85, goodFromAccuracy: 0.7 }),
  maxStrengths: 2,
  maxWeaknesses: 3,
});

/** Bounds a client-reported response time; recorded, never scored in V1 (ADAPTIVE_ENGINE.md §11). */
export const MAX_RECORDED_RESPONSE_TIME_MS = 3_600_000;
