import { Inject, Injectable } from "@nestjs/common";
import { type Database, tables } from "@qup/db";
import { and, eq, gte, sql } from "drizzle-orm";

import { DATABASE } from "../../../infrastructure/database/database.module.js";
import { OutboxEventType } from "../../../infrastructure/outbox/outbox.js";
import { USER_DIRECTORY, type UserDirectory } from "../../auth/auth.contract.js";
import { PURCHASE_FACTS, type PurchaseFacts } from "../../billing/billing.contract.js";

const { learningEvents } = tables;
const DAY_MS = 86_400_000;

/**
 * Learning metrics (OBSERVABILITY.md "Learning"), read from the analytics
 * stream this module owns (`learning_events`, fed by the outbox) rather than
 * from other modules' tables. One aggregate query per window.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(USER_DIRECTORY) private readonly users: UserDirectory,
    @Inject(PURCHASE_FACTS) private readonly purchases: PurchaseFacts,
  ) {}

  /**
   * The commercial funnel (PRD §17): accounts opened, then students who
   * finished the free mini diagnostic, then how many of those paid — all
   * within the window. A cohort of the window, not of a sign-up date: a
   * student who finished the diagnostic just before it is not counted.
   */
  async funnel(days: number, now = new Date()) {
    const since = new Date(now.getTime() - days * DAY_MS);
    const finishedMini = await this.db
      .selectDistinct({ studentId: learningEvents.studentId })
      .from(learningEvents)
      .where(
        and(
          gte(learningEvents.occurredAt, since),
          eq(learningEvents.eventType, OutboxEventType.SessionCompleted),
          sql`${learningEvents.payload}->>'sessionType' = 'MINI_DIAGNOSTIC'`,
        ),
      );
    // An erased account keeps its events without a student; it is not part of a cohort.
    const cohort = finishedMini.flatMap((row) => (row.studentId ? [row.studentId] : []));
    const [registered, paid] = await Promise.all([
      this.users.registeredSince(since),
      this.purchases.payingStudentsAmong(cohort, since),
    ]);
    return {
      days,
      registered,
      finishedMiniDiagnostic: cohort.length,
      paidAfterMiniDiagnostic: paid,
      conversionRate: cohort.length > 0 ? paid / cohort.length : null,
    };
  }

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
