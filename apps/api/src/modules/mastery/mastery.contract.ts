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
}

export interface SkillStanding {
  domains: { id: string; name: string; weight: number; skills: StandingSkill[] }[];
}

export interface SkillStandingReader {
  /** Null when the exam has no published taxonomy. */
  standing(studentId: string, examId: string): Promise<SkillStanding | null>;
}

export const SKILL_STANDING_READER = Symbol("SKILL_STANDING_READER");
