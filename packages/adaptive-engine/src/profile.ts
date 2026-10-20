import type { MasteryConfig } from "./config.js";
import { parentMastery } from "./parent-mastery.js";
import { deriveState, masteryScore } from "./scores.js";
import type { MasteryState, NodeMastery, NodeSettings } from "./types.js";

/**
 * Skill profile rules (ADAPTIVE_ENGINE.md §14–15). Pure: the caller loads the
 * states and the taxonomy; these decide what is a gap and how a skill made of
 * subskills reads.
 */

type MeasuredNode = Pick<
  NodeMastery,
  "masteryScore" | "confidenceScore" | "evidenceCount" | "coverageScore" | "state"
>;

/**
 * §15 — a gap is a measured node, known with enough confidence, below its
 * threshold and not mastered; severity = (threshold − mastery) / threshold.
 * Null when the node is not a gap.
 */
export function gapSeverity(
  node: Pick<MeasuredNode, "masteryScore" | "confidenceScore" | "evidenceCount" | "state">,
  threshold: number,
  config: MasteryConfig,
): number | null {
  if (node.evidenceCount === 0 || node.state === "MASTERED") return null;
  if (node.confidenceScore < config.states.minConfidence) return null;
  if (node.masteryScore >= threshold) return null;
  return (threshold - node.masteryScore) / threshold;
}

/** A skill as the profile reports it when its subskills define it. */
export type SkillAggregate = Omit<NodeMastery, "alpha" | "beta">;

const weightedAverage = (items: readonly { value: number; weight: number }[]): number => {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  return total === 0 ? 0 : items.reduce((sum, item) => sum + item.value * item.weight, 0) / total;
};

/**
 * §14 — a skill with subskills takes its mastery from them (parentMastery).
 * The rest follows OPEN_QUESTIONS.md #12c (defaults awaiting confirmation):
 * confidence is the weighted average over measured subskills, coverage over
 * all of them (unmeasured count as 0), the state is derived from those numbers
 * — except MASTERED, which needs every subskill mastered.
 */
export function aggregateSkill(
  children: readonly { node: MeasuredNode & { distinctQuestionCount: number }; weight: number }[],
  settings: NodeSettings,
  config: MasteryConfig,
): SkillAggregate {
  const weighted = children.filter((child) => child.weight > 0);
  const measured = weighted.filter((child) => child.node.evidenceCount > 0);
  const evidenceCount = weighted.reduce((sum, child) => sum + child.node.evidenceCount, 0);
  const distinctQuestionCount = weighted.reduce(
    (sum, child) => sum + child.node.distinctQuestionCount,
    0,
  );
  const coverageScore = weightedAverage(
    weighted.map((child) => ({ value: child.node.coverageScore, weight: child.weight })),
  );

  const mastery = parentMastery(
    weighted.map((child) => ({
      masteryScore: child.node.masteryScore,
      evidenceCount: child.node.evidenceCount,
      weight: child.weight,
    })),
  );
  if (mastery === null) {
    return {
      masteryScore: masteryScore(config.prior.alpha, config.prior.beta),
      confidenceScore: 0,
      evidenceCount: 0,
      distinctQuestionCount,
      coverageScore,
      state: "UNASSESSED",
    };
  }

  const confidenceScore = weightedAverage(
    measured.map((child) => ({ value: child.node.confidenceScore, weight: child.weight })),
  );
  const allMastered =
    weighted.length > 0 && weighted.every((child) => child.node.state === "MASTERED");
  const state: MasteryState = allMastered
    ? "MASTERED"
    : deriveState(
        { masteryScore: mastery, confidenceScore, evidenceCount, coverageScore },
        settings,
        config,
      );

  return {
    masteryScore: mastery,
    confidenceScore,
    evidenceCount,
    distinctQuestionCount,
    coverageScore,
    state,
  };
}

/** Gaps, largest first; equal severities keep the taxonomy's display order. */
export function rankGaps<T extends { severity: number; order: number }>(gaps: readonly T[]): T[] {
  return [...gaps].sort((a, b) => b.severity - a.severity || a.order - b.order);
}
