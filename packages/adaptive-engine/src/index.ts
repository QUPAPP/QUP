// @qup/adaptive-engine — the deterministic Mastery Engine V1 (ADAPTIVE_ENGINE.md).
// Pure functions only: no I/O, no clock, no framework; randomness only when injected.
export {
  type ApplyEvidenceInput,
  type ApplyEvidenceResult,
  applyEvidence,
  repeatFactor,
  weighEvidence,
} from "./apply-evidence.js";
export { ALGORITHM_VERSION, MASTERY_CONFIG_V1, type MasteryConfig } from "./config.js";
export { parentMastery } from "./parent-mastery.js";
export { aggregateSkill, gapSeverity, rankGaps, type SkillAggregate } from "./profile.js";
export {
  holdRemaining,
  REASSESSMENT_CONFIG_V1,
  type ReassessmentConfig,
  reassessmentPassed,
  requiredCorrect,
} from "./reassessment.js";
export {
  confidenceScore,
  coverageScore,
  deriveState,
  initialNodeMastery,
  masteryScore,
} from "./scores.js";
export {
  ADAPTIVE_ENGINE_VERSION,
  chooseTarget,
  type DifficultyReason,
  examWeightFactors,
  gapPriority,
  pickCandidate,
  prerequisiteBoost,
  rankCandidates,
  type ScoredCandidate,
  SELECTION_CONFIG_V1,
  type SelectionCandidate,
  type SelectionConfig,
  type TargetChoice,
  type TargetReason,
  type TargetSkill,
  targetDifficulty,
} from "./selection.js";
export type * from "./types.js";
