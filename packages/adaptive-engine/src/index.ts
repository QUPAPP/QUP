// @qup/adaptive-engine — the deterministic Mastery Engine V1 (ADAPTIVE_ENGINE.md).
// Pure functions only: no I/O, no clock, no randomness, no framework.
export {
  type ApplyEvidenceInput,
  type ApplyEvidenceResult,
  applyEvidence,
  repeatFactor,
  weighEvidence,
} from "./apply-evidence.js";
export { ALGORITHM_VERSION, MASTERY_CONFIG_V1, type MasteryConfig } from "./config.js";
export { parentMastery } from "./parent-mastery.js";
export {
  confidenceScore,
  coverageScore,
  deriveState,
  initialNodeMastery,
  masteryScore,
} from "./scores.js";
export type * from "./types.js";
