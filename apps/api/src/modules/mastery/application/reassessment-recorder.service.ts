import { Inject, Injectable } from "@nestjs/common";
import { REASSESSMENT_CONFIG_V1, reassessmentPassed, requiredCorrect } from "@qup/adaptive-engine";
import { type Database } from "@qup/db";

import { DATABASE } from "../../../infrastructure/database/database.module.js";
import { DrizzleReassessmentStore } from "../infrastructure/drizzle-reassessment-store.js";
import type { ReassessmentOutcome, ReassessmentRecorder } from "../mastery.contract.js";
import { SkillProfileService } from "./skill-profile.service.js";

const CONFIG = REASSESSMENT_CONFIG_V1;

/**
 * Grades finished skill reassessments (ADAPTIVE_ENGINE.md §13): enough correct
 * answers, and the skill still meets readiness once their evidence is in. A
 * pass is the only way to MASTERED.
 */
@Injectable()
export class ReassessmentRecorderService implements ReassessmentRecorder {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly store: DrizzleReassessmentStore,
    private readonly profiles: SkillProfileService,
  ) {}

  outcomeOf(sessionId: string): Promise<ReassessmentOutcome | null> {
    return this.store.findBySession(sessionId);
  }

  async record(input: {
    studentId: string;
    examId: string;
    skillId: string;
    sessionId: string;
    correct: number;
    total: number;
  }): Promise<ReassessmentOutcome> {
    const existing = await this.store.findBySession(input.sessionId);
    if (existing) return existing;

    const standing = await this.profiles.standing(input.studentId, input.examId);
    const skill = standing?.domains
      .flatMap((domain) => domain.skills)
      .find((candidate) => candidate.id === input.skillId);
    // A skill gone from the published taxonomy since the session began cannot pass.
    const passed = reassessmentPassed(
      {
        correct: input.correct,
        total: input.total,
        readyAfter: skill?.state === "READY_FOR_REASSESSMENT",
      },
      CONFIG,
    );
    const nodes =
      skill && skill.subskills.length > 0
        ? { skillIds: [], subskillIds: skill.subskills.map((sub) => sub.id) }
        : { skillIds: [input.skillId], subskillIds: [] };

    return this.db.transaction(async (tx) => {
      const recorded = await this.store.insertOutcome(tx, {
        studentId: input.studentId,
        examId: input.examId,
        sessionId: input.sessionId,
        skillId: input.skillId,
        passed,
        correct: input.correct,
        total: input.total,
        requiredCorrect: requiredCorrect(input.total, CONFIG),
        masteryAfter: skill?.mastery ?? null,
        configVersion: CONFIG.configVersion,
      });
      if (!recorded) {
        const first = await this.store.findBySession(input.sessionId, tx);
        if (!first)
          throw new Error(`Reassessment ${input.sessionId} conflicted but has no outcome.`);
        return first;
      }
      await this.store.markReassessed(tx, input.studentId, nodes, passed);
      return recorded;
    });
  }
}
