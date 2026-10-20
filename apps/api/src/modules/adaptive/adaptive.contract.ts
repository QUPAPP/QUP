import type { DbExecutor } from "../../infrastructure/database/executor.js";

/**
 * Public contract of adaptive selection (AGENTS.md §5, ADAPTIVE_ENGINE.md
 * §15–§20). Assessments asks what a training session should ask next and
 * stores the answer's item; this module decides and keeps the decision
 * auditable. It never depends on assessments.
 */

export interface TrainingContext {
  studentId: string;
  examId: string;
  /** The session's latest target, with its answers in this session (oldest first; true = correct). */
  current: { skillId: string; recentResults: boolean[] } | null;
  /** Logical questions this student has been given in this exam: never asked again (§18). */
  askedQuestionIds: ReadonlySet<string>;
}

/** Everything that explains one choice (AGENTS.md §6: explainable and auditable). */
export interface AdaptiveDecision {
  studentId: string;
  targetSkillId: string;
  reasons: string[];
  /** The target's mastery when chosen; null when it had no evidence yet. */
  masterySnapshot: number | null;
  confidenceSnapshot: number;
  targetDifficulty: number;
  /** The best-scored candidates considered, best first. */
  candidates: { questionVersionId: string; difficulty: number; score: number }[];
  selectedQuestionVersionId: string;
  engineVersion: string;
  configVersion: string;
}

export interface AdaptiveSelector {
  /** The next question for a training session, or null when nothing in the exam is left to train. */
  decide(context: TrainingContext): Promise<AdaptiveDecision | null>;
  /** Stores the decision in the caller's transaction, beside the item it chose; returns its id. */
  recordDecision(executor: DbExecutor, decision: AdaptiveDecision): Promise<string>;
  /**
   * The questions of a skill reassessment (ADAPTIVE_ENGINE.md §13: "fresh
   * when possible"): questions on the skill or its subskills, unseen first,
   * nearest the student's level; seen ones only to fill. At most `size`.
   */
  planReassessment(input: {
    studentId: string;
    examId: string;
    skillId: string;
    askedQuestionIds: ReadonlySet<string>;
    size: number;
  }): Promise<string[]>;
  /** The target skill of each decision, with its name. */
  targetsOf(
    decisionIds: readonly string[],
  ): Promise<Map<string, { skillId: string; skillName: string }>>;
}

export const ADAPTIVE_SELECTOR = Symbol("ADAPTIVE_SELECTOR");

/** Randomness for the §19 top-N pick; a provider so it can be replaced in tests. */
export const ADAPTIVE_RANDOM = Symbol("ADAPTIVE_RANDOM");
