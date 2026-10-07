import { ALGORITHM_VERSION, type MasteryConfig } from "./config.js";
import { confidenceScore, coverageScore, deriveState, masteryScore } from "./scores.js";
import type {
  EligibleAttempt,
  EvidenceReason,
  LearningNodeMapping,
  MasteryEventDraft,
  NodeMastery,
  NodeSettings,
} from "./types.js";

export interface ApplyEvidenceInput {
  prior: NodeMastery;
  settings: NodeSettings;
  attempt: EligibleAttempt;
  mapping: LearningNodeMapping;
  config: MasteryConfig;
}

export interface ApplyEvidenceResult {
  next: NodeMastery;
  /** Null when the attempt carries no evidence (skip, or a correct answer after reveal). */
  event: MasteryEventDraft | null;
}

const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * §23 — the pure core of the Mastery Engine:
 *
 *   applyEvidence(prior, attempt, mapping, config) → { next, event }
 *
 * Deterministic: the same input always gives the same output. No clock, no
 * randomness, no I/O. The caller persists `next` and `event` in one
 * transaction, guarded by the unique (attempt, node) event index (§22).
 */
export function applyEvidence(input: ApplyEvidenceInput): ApplyEvidenceResult {
  const { prior, attempt, mapping, config } = input;
  const evidence = weighEvidence(attempt, mapping, config);

  // §10 skip, §8 answer revealed: recorded elsewhere as analytics, but they
  // change nothing here and produce no mastery event.
  if (!evidence) return { next: prior, event: null };

  const alpha = prior.alpha + evidence.positive;
  const beta = prior.beta + evidence.negative;
  const distinctQuestionCount = prior.distinctQuestionCount + (attempt.previousAttemptAt ? 0 : 1);

  const scores = {
    masteryScore: masteryScore(alpha, beta),
    confidenceScore: confidenceScore(alpha, beta, config),
    evidenceCount: prior.evidenceCount + 1,
    coverageScore: coverageScore(distinctQuestionCount, input.settings.minCoverage),
  };

  const next: NodeMastery = {
    alpha,
    beta,
    ...scores,
    distinctQuestionCount,
    // MASTERED is set and cleared only by reassessment (OPEN_QUESTIONS.md #12a).
    state: prior.state === "MASTERED" ? "MASTERED" : deriveState(scores, input.settings, config),
  };

  return {
    next,
    event: {
      attemptId: attempt.attemptId,
      beforeMastery: prior.masteryScore,
      afterMastery: next.masteryScore,
      beforeConfidence: prior.confidenceScore,
      afterConfidence: next.confidenceScore,
      positiveEvidence: evidence.positive,
      negativeEvidence: evidence.negative,
      reasonCode: evidence.reason,
      difficulty: attempt.difficulty,
      attributionWeight: mapping.attributionWeight,
      algorithmVersion: ALGORITHM_VERSION,
      configVersion: config.configVersion,
    },
  };
}

interface WeighedEvidence {
  positive: number;
  negative: number;
  reason: EvidenceReason;
}

/** §5–§10. Returns null when the attempt yields no evidence at all. */
export function weighEvidence(
  attempt: EligibleAttempt,
  mapping: LearningNodeMapping,
  config: MasteryConfig,
): WeighedEvidence | null {
  const { result, difficulty } = attempt;
  const repeat = repeatFactor(attempt, config);

  if (result.kind === "SKIPPED") return null;

  if (result.kind === "TIMEOUT") {
    const negative =
      baseNegative(difficulty, config) * mapping.attributionWeight * repeat * config.timeoutFactor;
    return { positive: 0, negative, reason: "TIMEOUT" };
  }

  if (result.isCorrect) {
    const hint = result.answerRevealed
      ? config.hint.answerRevealed
      : result.hintUsed
        ? config.hint.used
        : config.hint.none;
    const positive = basePositive(difficulty, config) * mapping.attributionWeight * repeat * hint;
    if (positive === 0) return null; // correct only because the answer was shown
    return { positive, negative: 0, reason: result.hintUsed ? "CORRECT_WITH_HINT" : "CORRECT" };
  }

  // §6 — hints and reveals do not soften a wrong answer.
  const negative = baseNegative(difficulty, config) * mapping.attributionWeight * repeat;
  return { positive: 0, negative, reason: "INCORRECT" };
}

/** §5 — correct on a hard question is stronger evidence. */
function basePositive(difficulty: number, config: MasteryConfig): number {
  return config.positive.base + config.positive.perDifficulty * difficulty;
}

/** §6 — wrong on an easy question is stronger evidence. */
function baseNegative(difficulty: number, config: MasteryConfig): number {
  return config.negative.base - config.negative.perDifficulty * difficulty;
}

/** §9 — re-answering the same question soon after counts for less. */
export function repeatFactor(attempt: EligibleAttempt, config: MasteryConfig): number {
  if (!attempt.previousAttemptAt) return config.repeat.fresh;
  const days =
    (attempt.answeredAt.getTime() - attempt.previousAttemptAt.getTime()) / MILLISECONDS_PER_DAY;
  const band = config.repeat.bands.find((b) => days <= b.withinDays);
  return band ? band.factor : config.repeat.fresh;
}
