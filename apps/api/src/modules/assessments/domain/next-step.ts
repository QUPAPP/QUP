import type { SessionType } from "./ports.js";

/**
 * The student's next learning action in one exam (UI_BRAND.md "Primary CTA =
 * next recommended learning action", PRD §6 journey). Pure; first match wins.
 * Order and wording of the rules: OPEN_QUESTIONS.md #12f.
 */

export type NextStep =
  | { type: "RESUME_SESSION"; sessionId: string; sessionType: SessionType }
  | { type: "START_MINI_DIAGNOSTIC" }
  | { type: "SUBSCRIBE" }
  | { type: "START_FULL_DIAGNOSTIC" }
  | { type: "REASSESS"; skillId: string; skillName: string }
  | { type: "TRAIN"; skillName: string | null }
  | { type: "ALL_MASTERED" };

export interface NextStepInput {
  hasAccess: boolean;
  /** An unfinished session of any type in this exam. */
  openSession: { id: string; type: SessionType } | null;
  miniCompleted: boolean;
  fullCompleted: boolean;
  /** The first READY_FOR_REASSESSMENT skill in display order. */
  readySkill: { id: string; name: string } | null;
  /** Whether anything is trainable, and the top gap's name when there is a gap. */
  trainable: { any: boolean; topGapName: string | null };
}

export function nextStep(input: NextStepInput): NextStep {
  if (input.openSession) {
    return {
      type: "RESUME_SESSION",
      sessionId: input.openSession.id,
      sessionType: input.openSession.type,
    };
  }
  if (!input.hasAccess) {
    return input.miniCompleted ? { type: "SUBSCRIBE" } : { type: "START_MINI_DIAGNOSTIC" };
  }
  if (!input.fullCompleted) return { type: "START_FULL_DIAGNOSTIC" };
  if (input.readySkill) {
    return { type: "REASSESS", skillId: input.readySkill.id, skillName: input.readySkill.name };
  }
  if (input.trainable.any) return { type: "TRAIN", skillName: input.trainable.topGapName };
  return { type: "ALL_MASTERED" };
}
