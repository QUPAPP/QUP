import type { MasteryConfig } from "./config.js";
import type { MasteryState, NodeMastery, NodeSettings } from "./types.js";

/** §3 — mastery_score = alpha / (alpha + beta). */
export function masteryScore(alpha: number, beta: number): number {
  return alpha / (alpha + beta);
}

/**
 * §3 — effective evidence E = (alpha + beta) − (prior alpha + prior beta),
 * confidence = 1 − exp(−E / scale). Grows with evidence, never reaches 1.
 */
export function confidenceScore(alpha: number, beta: number, config: MasteryConfig): number {
  const effectiveEvidence = alpha + beta - (config.prior.alpha + config.prior.beta);
  return 1 - Math.exp(-Math.max(0, effectiveEvidence) / config.confidenceScale);
}

/** OPEN_QUESTIONS.md #12b — share of the node's required distinct questions seen. */
export function coverageScore(distinctQuestionCount: number, minCoverage: number): number {
  if (minCoverage <= 0) return 1;
  return Math.min(1, distinctQuestionCount / minCoverage);
}

/**
 * §12 — the state implied by the numbers.
 *
 * Never returns MASTERED: that requires a successful reassessment, which the
 * numbers alone cannot show ("threshold وحده لا يساوي MASTERED", DOMAIN_MODEL.md §3).
 */
export function deriveState(
  node: Pick<NodeMastery, "masteryScore" | "confidenceScore" | "evidenceCount" | "coverageScore">,
  settings: NodeSettings,
  config: MasteryConfig,
): Exclude<MasteryState, "MASTERED"> {
  const { states } = config;
  if (node.evidenceCount === 0) return "UNASSESSED";
  if (node.confidenceScore < states.minConfidence) return "UNCERTAIN";
  if (node.masteryScore < states.gapMasteryBelow) return "GAP";

  const threshold = settings.masteryThreshold ?? states.defaultMasteryThreshold;
  const ready =
    node.masteryScore >= threshold &&
    node.confidenceScore >= states.readyConfidence &&
    node.coverageScore >= states.requiredCoverage;
  return ready ? "READY_FOR_REASSESSMENT" : "DEVELOPING";
}

/**
 * §2 — a node the student has never been measured on. Shown to nobody as a
 * level: 50% here is the prior, not a finding ("لا تعرض 50% للطالب").
 */
export function initialNodeMastery(config: MasteryConfig): NodeMastery {
  const { alpha, beta } = config.prior;
  return {
    alpha,
    beta,
    masteryScore: masteryScore(alpha, beta),
    confidenceScore: 0,
    evidenceCount: 0,
    distinctQuestionCount: 0,
    coverageScore: 0,
    state: "UNASSESSED",
  };
}
