import type { MasteryState } from "@qup/adaptive-engine";

/**
 * Public read contract of the mastery module (AGENTS.md §5): where a student
 * stands on every node of an exam's published taxonomy, computed with the
 * engine's profile rules. Read by adaptive selection; no access check — the
 * caller decides who may see it.
 */

export interface StandingNode {
  id: string;
  name: string;
  state: MasteryState;
  /** Null until measured: the prior is never reported as a level. */
  mastery: number | null;
  confidence: number;
  coverage: number;
  evidenceCount: number;
  /** ADAPTIVE_ENGINE.md §15; null when the node is not a gap. */
  gapSeverity: number | null;
}

export interface StandingSkill extends StandingNode {
  weight: number;
  priorityWeight: number;
  prerequisiteSkillIds: string[];
  subskills: StandingNode[];
  /**
   * Set while a failed reassessment holds the skill (§13: new evidence before
   * a retry); a held skill that would be READY_FOR_REASSESSMENT reads DEVELOPING.
   */
  reassessment: { remainingAttempts: number } | null;
}

export interface SkillStanding {
  domains: { id: string; name: string; weight: number; skills: StandingSkill[] }[];
}

export interface SkillStandingReader {
  /** Null when the exam has no published taxonomy. */
  standing(studentId: string, examId: string): Promise<SkillStanding | null>;
  /**
   * How the student's mastery moved on these nodes since `since`: per node with
   * evidence, its mastery before the first and after the last of it.
   */
  recentChanges(
    studentId: string,
    nodes: { skillIds: readonly string[]; subskillIds: readonly string[] },
    since: Date,
  ): Promise<
    { skillId: string | null; subskillId: string | null; before: number; after: number }[]
  >;
}

/** Counts the profile and the dashboard both show (PRD §6). */
export function standingSummary(skills: readonly StandingNode[]) {
  const count = (state: MasteryState) => skills.filter((skill) => skill.state === state).length;
  return {
    skills: skills.length,
    assessed: skills.length - count("UNASSESSED"),
    gaps: skills.filter((skill) => skill.gapSeverity !== null).length,
    readyForReassessment: count("READY_FOR_REASSESSMENT"),
    mastered: count("MASTERED"),
  };
}

export const SKILL_STANDING_READER = Symbol("SKILL_STANDING_READER");

/** A recorded skill reassessment (ADAPTIVE_ENGINE.md §13). */
export interface ReassessmentOutcome {
  skillId: string;
  passed: boolean;
  correct: number;
  total: number;
  requiredCorrect: number;
}

export interface ReassessmentRecorder {
  /**
   * Grades a finished reassessment against the skill's standing after its own
   * evidence, and records it — once per session: a repeat call returns the
   * first outcome. A pass marks the skill MASTERED in the same transaction.
   */
  record(input: {
    studentId: string;
    examId: string;
    skillId: string;
    sessionId: string;
    correct: number;
    total: number;
  }): Promise<ReassessmentOutcome>;
  outcomeOf(sessionId: string): Promise<ReassessmentOutcome | null>;
}

export const REASSESSMENT_RECORDER = Symbol("REASSESSMENT_RECORDER");
