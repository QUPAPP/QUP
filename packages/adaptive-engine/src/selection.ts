import type { MasteryState } from "./types.js";

/**
 * Adaptive selection (ADAPTIVE_ENGINE.md §15–§20, WORKFLOWS.md §4): which
 * skill to train next, at what difficulty, with which question. Pure: the
 * caller loads states, taxonomy and candidates; randomness is injected so
 * tests can seed it (§19). Defaults the spec leaves open are recorded in
 * OPEN_QUESTIONS.md #12d.
 */

export const ADAPTIVE_ENGINE_VERSION = "adaptive-v1.0";

export interface SelectionConfig {
  configVersion: string;
  /** §16 — boost for a skill other gaps depend on: min(1 + perDependentGap × n, max). */
  prerequisiteBoost: { perDependentGap: number; max: number };
  /** §17 — target difficulty = clamp(mastery + adjustment, min, max). */
  difficulty: {
    min: number;
    max: number;
    /** Mastery assumed for a node with no evidence yet (the prior's mean). */
    unmeasuredMastery: number;
    afterTwoCorrect: number;
    afterTwoWrong: number;
  };
  /** §18 — candidates within ± band of the target difficulty, widened when none fits. */
  band: number;
  /** §19 — candidate score weights; `maxDistance` scales the difficulty fit to 0..1. */
  score: {
    difficultyFit: number;
    learningNeed: number;
    novelty: number;
    contentQuality: number;
    coverageNeed: number;
    maxDistance: number;
  };
  /** §19 — the choice is weighted-random among the best `topN`. */
  topN: number;
  /** §20 — wrong answers in a row on a target before its prerequisites are checked. */
  wrongStreakForPrerequisite: number;
}

export const SELECTION_CONFIG_V1: SelectionConfig = Object.freeze({
  configVersion: "selection-config-v1.0",
  prerequisiteBoost: { perDependentGap: 0.2, max: 1.6 },
  difficulty: {
    min: 0.2,
    max: 0.9,
    unmeasuredMastery: 0.5,
    afterTwoCorrect: 0.05,
    afterTwoWrong: -0.1,
  },
  band: 0.15,
  score: {
    difficultyFit: 0.4,
    learningNeed: 0.25,
    novelty: 0.15,
    contentQuality: 0.1,
    coverageNeed: 0.1,
    maxDistance: 0.7,
  },
  topN: 3,
  wrongStreakForPrerequisite: 3,
});

/* ------------------------------------------------------------------ targets */

export interface TargetSkill {
  id: string;
  /** Position in the exam's display order; ties keep it. */
  order: number;
  state: MasteryState;
  /** `gapSeverity` of the skill, or null when it is not a gap. */
  severity: number | null;
  examWeightFactor: number;
  priorityWeight: number;
  prerequisiteIds: readonly string[];
  /** Whether a question the student has not been given still measures it. */
  hasCandidates: boolean;
}

export type TargetReason =
  | "CONTINUE_TARGET"
  | "TOP_GAP"
  | "NEEDS_MEASUREMENT"
  | "PREREQUISITE_CHECK";

export interface TargetChoice {
  skillId: string;
  reason: TargetReason;
  /** The §16 priority when the target is a gap; null otherwise. */
  priority: number | null;
}

/** Measured too little, or below readiness without being a gap: more evidence helps. */
const NEEDS_EVIDENCE: ReadonlySet<MasteryState> = new Set([
  "UNASSESSED",
  "UNCERTAIN",
  "DEVELOPING",
]);

/** §16 — every factor is ≥ 0, so a zero anywhere means "not now". */
export function gapPriority(input: {
  severity: number;
  examWeightFactor: number;
  priorityWeight: number;
  prerequisiteBoost: number;
}): number {
  return input.severity * input.examWeightFactor * input.priorityWeight * input.prerequisiteBoost;
}

/**
 * §16 "normalize": a skill's share of the exam (domain share × share within
 * its domain), scaled by the number of skills so the average factor is 1.
 */
export function examWeightFactors(
  domains: readonly { weight: number; skills: readonly { id: string; weight: number }[] }[],
): Map<string, number> {
  const domainTotal = domains.reduce((sum, d) => sum + d.weight, 0);
  const skillCount = domains.reduce((sum, d) => sum + d.skills.length, 0);
  const factors = new Map<string, number>();
  for (const domain of domains) {
    const skillTotal = domain.skills.reduce((sum, s) => sum + s.weight, 0);
    for (const skill of domain.skills) {
      const share =
        domainTotal > 0 && skillTotal > 0
          ? (domain.weight / domainTotal) * (skill.weight / skillTotal)
          : 0;
      factors.set(skill.id, share * skillCount);
    }
  }
  return factors;
}

export function prerequisiteBoost(dependentGaps: number, config: SelectionConfig): number {
  return Math.min(
    1 + config.prerequisiteBoost.perDependentGap * dependentGaps,
    config.prerequisiteBoost.max,
  );
}

/**
 * The skill to train next (WORKFLOWS.md §4 "Repeat / Reassess / Switch Gap"):
 *   1. the session's current target while it is still trainable — unless it
 *      was answered wrong `wrongStreakForPrerequisite` times in a row and one
 *      of its prerequisites is trainable (§20);
 *   2. else the gap with the highest §16 priority;
 *   3. else the skill most in need of evidence, by its weight in the exam.
 * A skill with no question left is never chosen. Null: nothing to train.
 */
export function chooseTarget(
  input: {
    skills: readonly TargetSkill[];
    current: { skillId: string; recentResults: readonly boolean[] } | null;
  },
  config: SelectionConfig,
): TargetChoice | null {
  const byId = new Map(input.skills.map((s) => [s.id, s]));
  const dependentGaps = new Map<string, number>();
  for (const skill of input.skills) {
    if (skill.severity === null) continue;
    for (const id of skill.prerequisiteIds) {
      dependentGaps.set(id, (dependentGaps.get(id) ?? 0) + 1);
    }
  }
  const priorityOf = (skill: TargetSkill) =>
    skill.severity === null
      ? null
      : gapPriority({
          severity: skill.severity,
          examWeightFactor: skill.examWeightFactor,
          priorityWeight: skill.priorityWeight,
          prerequisiteBoost: prerequisiteBoost(dependentGaps.get(skill.id) ?? 0, config),
        });
  const isGap = (skill: TargetSkill) => skill.hasCandidates && skill.severity !== null;
  const needsEvidence = (skill: TargetSkill) =>
    skill.hasCandidates && skill.severity === null && NEEDS_EVIDENCE.has(skill.state);
  const trainable = (skill: TargetSkill) => isGap(skill) || needsEvidence(skill);
  const choose = (skill: TargetSkill, reason: TargetReason): TargetChoice => ({
    skillId: skill.id,
    reason,
    priority: priorityOf(skill),
  });

  const current = input.current ? byId.get(input.current.skillId) : undefined;
  if (input.current && current && trainable(current)) {
    if (trailingWrong(input.current.recentResults) >= config.wrongStreakForPrerequisite) {
      const prerequisite = best(
        current.prerequisiteIds.flatMap((id) => {
          const skill = byId.get(id);
          return skill && trainable(skill) ? [skill] : [];
        }),
        priorityOf,
      );
      if (prerequisite) return choose(prerequisite, "PREREQUISITE_CHECK");
    }
    return choose(current, "CONTINUE_TARGET");
  }

  const gap = best(input.skills.filter(isGap), priorityOf);
  if (gap) return choose(gap, "TOP_GAP");
  const measure = [...input.skills.filter(needsEvidence)].sort(
    (a, b) => b.examWeightFactor - a.examWeightFactor || a.order - b.order,
  )[0];
  return measure ? choose(measure, "NEEDS_MEASUREMENT") : null;
}

/** Gaps first by priority, then the rest by weight; display order breaks ties. */
function best(
  skills: readonly TargetSkill[],
  priorityOf: (skill: TargetSkill) => number | null,
): TargetSkill | undefined {
  return [...skills].sort(
    (a, b) =>
      (priorityOf(b) ?? -1) - (priorityOf(a) ?? -1) ||
      b.examWeightFactor - a.examWeightFactor ||
      a.order - b.order,
  )[0];
}

function trailingWrong(results: readonly boolean[]): number {
  let count = 0;
  for (let i = results.length - 1; i >= 0 && results[i] === false; i--) count++;
  return count;
}

/* --------------------------------------------------------------- difficulty */

export type DifficultyReason = "RECENT_CORRECT_UP" | "RECENT_WRONG_DOWN";

/**
 * §17 — the target's mastery, nudged by its last two answers in the session
 * (§20: one wrong answer keeps a nearby level; two lower it modestly).
 */
export function targetDifficulty(
  mastery: number | null,
  recentResults: readonly boolean[],
  config: SelectionConfig,
): { value: number; reasons: DifficultyReason[] } {
  const { difficulty } = config;
  const lastTwo = recentResults.slice(-2);
  let adjustment = 0;
  const reasons: DifficultyReason[] = [];
  if (lastTwo.length === 2 && lastTwo.every((correct) => correct)) {
    adjustment = difficulty.afterTwoCorrect;
    reasons.push("RECENT_CORRECT_UP");
  } else if (lastTwo.length === 2 && lastTwo.every((correct) => !correct)) {
    adjustment = difficulty.afterTwoWrong;
    reasons.push("RECENT_WRONG_DOWN");
  }
  const base = mastery ?? difficulty.unmeasuredMastery;
  return {
    value: Math.min(difficulty.max, Math.max(difficulty.min, base + adjustment)),
    reasons,
  };
}

/* --------------------------------------------------------------- candidates */

/** A question the student has not been given, measuring the target or one of its subskills. */
export interface SelectionCandidate {
  questionVersionId: string;
  difficulty: number;
  /** Gap severity of the node the question primarily measures; null when it is not a gap. */
  nodeSeverity: number | null;
  /** Whether that node has any evidence yet. */
  nodeMeasured: boolean;
  nodeCoverage: number;
}

export interface ScoredCandidate extends SelectionCandidate {
  score: number;
}

/** Absorbs floating-point noise at the band's edge (0.65 − 0.5 is not exactly 0.15). */
const BAND_EPSILON = 1e-9;

/**
 * §18 band filter and §19 score, best first. Every candidate passed in is
 * already published, unseen and on the target; when none fits the band, all
 * of them are ranked instead (`widened`), so training never stalls on a gap
 * in difficulty coverage.
 */
export function rankCandidates(
  candidates: readonly SelectionCandidate[],
  target: number,
  config: SelectionConfig,
): { scored: ScoredCandidate[]; widened: boolean } {
  const inBand = candidates.filter(
    (c) => Math.abs(c.difficulty - target) <= config.band + BAND_EPSILON,
  );
  const pool = inBand.length > 0 ? inBand : candidates;
  const { score } = config;
  const scored = pool
    .map((c) => {
      const fit = Math.max(0, 1 - Math.abs(c.difficulty - target) / score.maxDistance);
      const need = c.nodeMeasured ? (c.nodeSeverity ?? 0) : 1;
      return {
        ...c,
        score:
          score.difficultyFit * fit +
          score.learningNeed * need +
          // Every candidate is unseen and published: full novelty and quality (§18).
          score.novelty +
          score.contentQuality +
          score.coverageNeed * (1 - c.nodeCoverage),
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        Math.abs(a.difficulty - target) - Math.abs(b.difficulty - target) ||
        a.questionVersionId.localeCompare(b.questionVersionId),
    );
  return { scored, widened: inBand.length === 0 && candidates.length > 0 };
}

/** §19 — weighted by score among the top `topN`, so students do not all walk the same path. */
export function pickCandidate(
  scored: readonly ScoredCandidate[],
  random: () => number,
  config: SelectionConfig,
): ScoredCandidate | null {
  const top = scored.slice(0, config.topN);
  if (top.length === 0) return null;
  const total = top.reduce((sum, c) => sum + c.score, 0);
  if (total <= 0) return top[0] ?? null;
  let threshold = random() * total;
  for (const candidate of top) {
    threshold -= candidate.score;
    if (threshold < 0) return candidate;
  }
  return top[top.length - 1] ?? null;
}
