import { Inject, Injectable } from "@nestjs/common";
import type { MasteryState } from "@qup/adaptive-engine";
import { type Database, tables } from "@qup/db";
import { and, eq, gte, inArray, or, sql } from "drizzle-orm";

import { DATABASE } from "../../../infrastructure/database/database.module.js";

const { studentMasteryStates, masteryEvents } = tables;

export interface StoredNodeState {
  skillId: string | null;
  subskillId: string | null;
  masteryScore: number;
  confidenceScore: number;
  coverageScore: number;
  evidenceCount: number;
  distinctQuestionCount: number;
  state: MasteryState;
}

/** Reads a student's mastery states; one query per profile. */
@Injectable()
export class DrizzleMasteryReader {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async statesFor(studentId: string, examId: string): Promise<StoredNodeState[]> {
    const rows = await this.db
      .select({
        skillId: studentMasteryStates.skillId,
        subskillId: studentMasteryStates.subskillId,
        masteryScore: studentMasteryStates.masteryScore,
        confidenceScore: studentMasteryStates.confidenceScore,
        coverageScore: studentMasteryStates.coverageScore,
        evidenceCount: studentMasteryStates.evidenceCount,
        distinctQuestionCount: studentMasteryStates.distinctQuestionCount,
        state: studentMasteryStates.state,
      })
      .from(studentMasteryStates)
      .where(
        and(eq(studentMasteryStates.studentId, studentId), eq(studentMasteryStates.examId, examId)),
      );
    return rows.map((row) => ({
      ...row,
      masteryScore: Number(row.masteryScore),
      confidenceScore: Number(row.confidenceScore),
      coverageScore: Number(row.coverageScore),
    }));
  }

  /** Per node with evidence since `since`: its mastery before the first and after the last. */
  async recentChanges(
    studentId: string,
    nodes: { skillIds: readonly string[]; subskillIds: readonly string[] },
    since: Date,
  ): Promise<NodeChange[]> {
    const onNodes = or(
      nodes.skillIds.length ? inArray(masteryEvents.skillId, [...nodes.skillIds]) : undefined,
      nodes.subskillIds.length
        ? inArray(masteryEvents.subskillId, [...nodes.subskillIds])
        : undefined,
    );
    if (!onNodes) return [];
    const rows = await this.db
      .select({
        skillId: masteryEvents.skillId,
        subskillId: masteryEvents.subskillId,
        before: sql<string>`(array_agg(${masteryEvents.beforeMastery} ORDER BY ${masteryEvents.createdAt}, ${masteryEvents.id}))[1]`,
        after: sql<string>`(array_agg(${masteryEvents.afterMastery} ORDER BY ${masteryEvents.createdAt} DESC, ${masteryEvents.id} DESC))[1]`,
      })
      .from(masteryEvents)
      .where(
        and(eq(masteryEvents.studentId, studentId), onNodes, gte(masteryEvents.createdAt, since)),
      )
      .groupBy(masteryEvents.skillId, masteryEvents.subskillId);
    return rows.map((row) => ({
      skillId: row.skillId,
      subskillId: row.subskillId,
      before: Number(row.before),
      after: Number(row.after),
    }));
  }
}

export interface NodeChange {
  skillId: string | null;
  subskillId: string | null;
  before: number;
  after: number;
}
