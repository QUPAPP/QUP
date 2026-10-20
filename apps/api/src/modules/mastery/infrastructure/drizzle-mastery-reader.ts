import { Inject, Injectable } from "@nestjs/common";
import type { MasteryState } from "@qup/adaptive-engine";
import { type Database, tables } from "@qup/db";
import { and, eq } from "drizzle-orm";

import { DATABASE } from "../../../infrastructure/database/database.module.js";

const { studentMasteryStates } = tables;

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
}
