import { Inject, Injectable } from "@nestjs/common";
import { type Database, tables } from "@qup/db";
import { eq, inArray } from "drizzle-orm";

import { DATABASE } from "../../../infrastructure/database/database.module.js";
import type { DbExecutor } from "../../../infrastructure/database/executor.js";
import type { AdaptiveDecision } from "../adaptive.contract.js";

const { adaptiveDecisions, skills } = tables;

/** numeric(6, 5) and numeric(4, 3) columns: stored exactly at their scale. */
const SNAPSHOT_SCALE = 5;
const DIFFICULTY_SCALE = 3;

/** adaptive_decisions: written beside the item it chose, read back to explain it. */
@Injectable()
export class DrizzleDecisionStore {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async record(executor: DbExecutor, decision: AdaptiveDecision): Promise<string> {
    const [row] = await executor
      .insert(adaptiveDecisions)
      .values({
        studentId: decision.studentId,
        targetSkillId: decision.targetSkillId,
        masterySnapshot:
          decision.masterySnapshot === null
            ? null
            : decision.masterySnapshot.toFixed(SNAPSHOT_SCALE),
        confidenceSnapshot: decision.confidenceSnapshot.toFixed(SNAPSHOT_SCALE),
        targetDifficulty: decision.targetDifficulty.toFixed(DIFFICULTY_SCALE),
        candidateSnapshot: decision.candidates,
        selectedQuestionVersionId: decision.selectedQuestionVersionId,
        reasonCodes: decision.reasons,
        engineVersion: decision.engineVersion,
        configVersion: decision.configVersion,
      })
      .returning({ id: adaptiveDecisions.id });
    if (!row) throw new Error("Decision insert returned no row.");
    return row.id;
  }

  async targets(
    decisionIds: readonly string[],
  ): Promise<Map<string, { skillId: string; skillName: string }>> {
    if (decisionIds.length === 0) return new Map();
    const rows = await this.db
      .select({ id: adaptiveDecisions.id, skillId: skills.id, skillName: skills.name })
      .from(adaptiveDecisions)
      .innerJoin(skills, eq(skills.id, adaptiveDecisions.targetSkillId))
      .where(inArray(adaptiveDecisions.id, [...decisionIds]));
    return new Map(rows.map((r) => [r.id, { skillId: r.skillId, skillName: r.skillName }]));
  }
}
