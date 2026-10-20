import { Inject, Injectable } from "@nestjs/common";
import { type Database, tables } from "@qup/db";
import { and, countDistinct, desc, eq, gt, inArray, or, sql } from "drizzle-orm";

import { DATABASE } from "../../../infrastructure/database/database.module.js";
import type { DbExecutor } from "../../../infrastructure/database/executor.js";
import type { ReassessmentOutcome } from "../mastery.contract.js";

const { skillReassessments, masteryEvents, studentMasteryStates } = tables;

/** numeric(6, 5). */
const MASTERY_SCALE = 5;

/** The nodes a reassessment speaks for: the skill itself, or every one of its subskills. */
export interface ReassessedNodes {
  skillIds: readonly string[];
  subskillIds: readonly string[];
}

const outcomeColumns = {
  skillId: skillReassessments.skillId,
  passed: skillReassessments.passed,
  correct: skillReassessments.correct,
  total: skillReassessments.total,
  requiredCorrect: skillReassessments.requiredCorrect,
};

/** skill_reassessments, plus the evidence and state rows a reassessment reads and marks. */
@Injectable()
export class DrizzleReassessmentStore {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Each skill's latest outcome for the student in this exam. */
  async latest(
    studentId: string,
    examId: string,
  ): Promise<Map<string, { passed: boolean; at: Date }>> {
    const rows = await this.db
      .selectDistinctOn([skillReassessments.skillId], {
        skillId: skillReassessments.skillId,
        passed: skillReassessments.passed,
        at: skillReassessments.createdAt,
      })
      .from(skillReassessments)
      .where(
        and(eq(skillReassessments.studentId, studentId), eq(skillReassessments.examId, examId)),
      )
      .orderBy(skillReassessments.skillId, desc(skillReassessments.createdAt));
    return new Map(rows.map((r) => [r.skillId, { passed: r.passed, at: r.at }]));
  }

  /** Answers that carried evidence to these nodes after `since` (one per attempt). */
  async attemptsSince(studentId: string, nodes: ReassessedNodes, since: Date): Promise<number> {
    const onNodes = or(
      nodes.skillIds.length ? inArray(masteryEvents.skillId, [...nodes.skillIds]) : undefined,
      nodes.subskillIds.length
        ? inArray(masteryEvents.subskillId, [...nodes.subskillIds])
        : undefined,
    );
    if (!onNodes) return 0;
    const [row] = await this.db
      .select({ attempts: countDistinct(masteryEvents.attemptId) })
      .from(masteryEvents)
      .where(
        and(eq(masteryEvents.studentId, studentId), onNodes, gt(masteryEvents.createdAt, since)),
      );
    return row?.attempts ?? 0;
  }

  async findBySession(
    sessionId: string,
    executor: DbExecutor = this.db,
  ): Promise<ReassessmentOutcome | null> {
    const [row] = await executor
      .select(outcomeColumns)
      .from(skillReassessments)
      .where(eq(skillReassessments.sessionId, sessionId));
    return row ?? null;
  }

  /** Null when the session already has an outcome (a concurrent call recorded it first). */
  async insertOutcome(
    executor: DbExecutor,
    outcome: ReassessmentOutcome & {
      studentId: string;
      examId: string;
      sessionId: string;
      masteryAfter: number | null;
      configVersion: string;
    },
  ): Promise<ReassessmentOutcome | null> {
    const [row] = await executor
      .insert(skillReassessments)
      .values({
        studentId: outcome.studentId,
        examId: outcome.examId,
        skillId: outcome.skillId,
        sessionId: outcome.sessionId,
        passed: outcome.passed,
        correct: outcome.correct,
        total: outcome.total,
        requiredCorrect: outcome.requiredCorrect,
        masteryAfter:
          outcome.masteryAfter === null ? null : outcome.masteryAfter.toFixed(MASTERY_SCALE),
        configVersion: outcome.configVersion,
      })
      .onConflictDoNothing({ target: skillReassessments.sessionId })
      .returning(outcomeColumns);
    return row ?? null;
  }

  /**
   * Stamps the reassessment on the nodes' state rows; a pass also makes them
   * MASTERED, which evidence never undoes (OPEN_QUESTIONS.md #12a).
   */
  async markReassessed(
    executor: DbExecutor,
    studentId: string,
    nodes: ReassessedNodes,
    passed: boolean,
  ): Promise<void> {
    const onNodes = or(
      nodes.skillIds.length
        ? inArray(studentMasteryStates.skillId, [...nodes.skillIds])
        : undefined,
      nodes.subskillIds.length
        ? inArray(studentMasteryStates.subskillId, [...nodes.subskillIds])
        : undefined,
    );
    if (!onNodes) return;
    await executor
      .update(studentMasteryStates)
      .set({
        lastReassessmentAt: sql`now()`,
        rowVersion: sql`${studentMasteryStates.rowVersion} + 1`,
        ...(passed ? { state: "MASTERED" as const } : {}),
      })
      .where(and(eq(studentMasteryStates.studentId, studentId), onNodes));
  }
}
