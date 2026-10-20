import { Inject, Injectable } from "@nestjs/common";
import { type Database, tables } from "@qup/db";
import { gte, sql } from "drizzle-orm";

import { DATABASE } from "../../../infrastructure/database/database.module.js";
import { OutboxEventType } from "../../../infrastructure/outbox/outbox.js";

const { learningEvents } = tables;
const DAY_MS = 86_400_000;

/**
 * Learning metrics (OBSERVABILITY.md "Learning"), read from the analytics
 * stream this module owns (`learning_events`, fed by the outbox) rather than
 * from other modules' tables. One aggregate query per window.
 */
@Injectable()
export class AnalyticsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async learning(days: number, now = new Date()) {
    const since = new Date(now.getTime() - days * DAY_MS);
    const type = learningEvents.eventType;
    const field = (name: string) => sql`${learningEvents.payload}->>${name}`;
    const count = (condition: ReturnType<typeof sql>) =>
      sql<number>`count(*) FILTER (WHERE ${condition})::int`;
    const created = (sessionType: string) =>
      count(
        sql`${type} = ${OutboxEventType.SessionCreated} AND ${field("sessionType")} = ${sessionType}`,
      );
    const completed = (sessionType: string) =>
      count(
        sql`${type} = ${OutboxEventType.SessionCompleted} AND ${field("sessionType")} = ${sessionType}`,
      );
    const attempt = sql`${type} = ${OutboxEventType.AttemptRecorded}`;
    const reassessed = sql`${type} = ${OutboxEventType.ReassessmentRecorded}`;

    const [row] = await this.db
      .select({
        activeStudents: sql<number>`count(DISTINCT ${learningEvents.studentId}) FILTER (WHERE ${attempt})::int`,
        miniStarted: created("MINI_DIAGNOSTIC"),
        miniCompleted: completed("MINI_DIAGNOSTIC"),
        fullStarted: created("FULL_DIAGNOSTIC"),
        fullCompleted: completed("FULL_DIAGNOSTIC"),
        trainingSessions: created("ADAPTIVE_TRAINING"),
        answered: count(sql`${attempt} AND ${field("resultType")} = 'ANSWERED'`),
        correct: count(sql`${attempt} AND ${field("isCorrect")} = 'true'`),
        skipped: count(sql`${attempt} AND ${field("resultType")} = 'SKIPPED'`),
        reassessmentsPassed: count(sql`${reassessed} AND ${field("passed")} = 'true'`),
        reassessmentsFailed: count(sql`${reassessed} AND ${field("passed")} = 'false'`),
      })
      .from(learningEvents)
      .where(gte(learningEvents.occurredAt, since));

    const answered = row?.answered ?? 0;
    return {
      days,
      activeStudents: row?.activeStudents ?? 0,
      diagnostics: {
        miniStarted: row?.miniStarted ?? 0,
        miniCompleted: row?.miniCompleted ?? 0,
        fullStarted: row?.fullStarted ?? 0,
        fullCompleted: row?.fullCompleted ?? 0,
      },
      trainingSessions: row?.trainingSessions ?? 0,
      attempts: {
        answered,
        skipped: row?.skipped ?? 0,
        correctRate: answered > 0 ? (row?.correct ?? 0) / answered : null,
      },
      reassessments: {
        passed: row?.reassessmentsPassed ?? 0,
        failed: row?.reassessmentsFailed ?? 0,
      },
    };
  }
}
