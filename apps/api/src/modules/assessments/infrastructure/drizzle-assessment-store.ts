import { Inject, Injectable } from "@nestjs/common";
import type { EligibleAttempt } from "@qup/adaptive-engine";
import { type Database, tables } from "@qup/db";
import { and, asc, count, desc, eq, inArray, max, sql } from "drizzle-orm";

import { DomainError } from "../../../common/errors/domain-error.js";
import { DATABASE } from "../../../infrastructure/database/database.module.js";
import type { DbExecutor } from "../../../infrastructure/database/executor.js";
import { PgErrorCode, pgErrorInfo } from "../../../infrastructure/database/postgres-errors.js";
import { OutboxEventType, writeOutbox } from "../../../infrastructure/outbox/outbox.js";
import { MasteryWriter } from "../../mastery/infrastructure/mastery-writer.js";
import {
  AssessmentIncomplete,
  AssessmentNotActive,
  AssessmentNotFound,
  IdempotencyKeyReused,
  ItemAlreadyAnswered,
} from "../domain/assessment.errors.js";
import type {
  AssessmentStore,
  PlannedSessionItem,
  RecordAttemptCommand,
  RecordAttemptResult,
  Session,
  SessionHistoryEntry,
  SessionHistoryQuery,
  SessionItem,
  SessionProgress,
  SessionType,
  StoredAttempt,
} from "../domain/ports.js";

const { assessmentSessions, assessmentItems, questionAttempts } = tables;

/** Outbox aggregate for session events (assessment.attempt.recorded, assessment.session.completed). */
const SESSION_AGGREGATE = "assessment_session";

const sessionColumns = {
  id: assessmentSessions.id,
  studentId: assessmentSessions.studentId,
  examId: assessmentSessions.examId,
  type: assessmentSessions.type,
  status: assessmentSessions.status,
  startedAt: assessmentSessions.startedAt,
  completedAt: assessmentSessions.completedAt,
  createdAt: assessmentSessions.createdAt,
  resultConfigVersion: assessmentSessions.resultConfigVersion,
  plannedItemCount: assessmentSessions.plannedItemCount,
  targetSkillId: assessmentSessions.targetSkillId,
};

const attemptColumns = {
  id: questionAttempts.id,
  assessmentItemId: questionAttempts.assessmentItemId,
  studentId: questionAttempts.studentId,
  isCorrect: questionAttempts.isCorrect,
  resultType: questionAttempts.resultType,
  idempotencyKey: questionAttempts.idempotencyKey,
};

@Injectable()
export class DrizzleAssessmentStore implements AssessmentStore {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly mastery: MasteryWriter,
  ) {}

  async history(
    studentId: string,
    query: SessionHistoryQuery,
  ): Promise<{ items: SessionHistoryEntry[]; hasMore: boolean }> {
    // Read a bounded page first: progress is aggregated only for these sessions,
    // never once per session or across the student's entire question history.
    return this.db.transaction(
      async (tx) => {
        const rows = await tx
          .select(sessionColumns)
          .from(assessmentSessions)
          .where(
            and(
              eq(assessmentSessions.studentId, studentId),
              query.examId ? eq(assessmentSessions.examId, query.examId) : undefined,
              query.status ? eq(assessmentSessions.status, query.status) : undefined,
            ),
          )
          .orderBy(desc(assessmentSessions.createdAt), desc(assessmentSessions.id))
          .limit(query.limit + 1)
          .offset(query.offset);
        const sessions = rows.slice(0, query.limit);
        if (sessions.length === 0) return { items: [], hasMore: false };

        const counts = await tx
          .select({
            sessionId: assessmentItems.sessionId,
            total: count(assessmentItems.id),
            finalized: count(questionAttempts.id),
          })
          .from(assessmentItems)
          .leftJoin(questionAttempts, eq(questionAttempts.assessmentItemId, assessmentItems.id))
          .where(
            inArray(
              assessmentItems.sessionId,
              sessions.map((session) => session.id),
            ),
          )
          .groupBy(assessmentItems.sessionId);
        const progress = new Map(counts.map((row) => [row.sessionId, row]));
        return {
          items: sessions.map((session) => ({
            session,
            progress: {
              total: session.plannedItemCount ?? progress.get(session.id)?.total ?? 0,
              finalized: progress.get(session.id)?.finalized ?? 0,
            },
          })),
          hasMore: rows.length > query.limit,
        };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  }

  async activityOf(studentId: string) {
    const [exams, open, completed] = await Promise.all([
      this.db
        .selectDistinct({ examId: assessmentSessions.examId })
        .from(assessmentSessions)
        .where(eq(assessmentSessions.studentId, studentId)),
      this.db
        .select(sessionColumns)
        .from(assessmentSessions)
        .where(
          and(
            eq(assessmentSessions.studentId, studentId),
            inArray(assessmentSessions.status, ["CREATED", "IN_PROGRESS"]),
          ),
        )
        .orderBy(desc(assessmentSessions.createdAt)),
      this.db
        .selectDistinct({ examId: assessmentSessions.examId, type: assessmentSessions.type })
        .from(assessmentSessions)
        .where(
          and(
            eq(assessmentSessions.studentId, studentId),
            eq(assessmentSessions.status, "COMPLETED"),
          ),
        ),
    ]);
    return { examIds: new Set(exams.map((row) => row.examId)), open, completed };
  }

  async findSession(sessionId: string): Promise<Session | null> {
    const [row] = await this.db
      .select(sessionColumns)
      .from(assessmentSessions)
      .where(eq(assessmentSessions.id, sessionId));
    return row ?? null;
  }

  sessionsFor(studentId: string, examId: string, type: SessionType): Promise<Session[]> {
    return this.db
      .select(sessionColumns)
      .from(assessmentSessions)
      .where(
        and(
          eq(assessmentSessions.studentId, studentId),
          eq(assessmentSessions.examId, examId),
          eq(assessmentSessions.type, type),
        ),
      )
      .orderBy(desc(assessmentSessions.createdAt));
  }

  async items(sessionId: string): Promise<SessionItem[]> {
    const rows = await this.db
      .select({
        id: assessmentItems.id,
        ordinal: assessmentItems.ordinal,
        questionVersionId: assessmentItems.questionVersionId,
        presentedAt: assessmentItems.presentedAt,
        adaptiveDecisionId: assessmentItems.adaptiveDecisionId,
        attemptId: questionAttempts.id,
        resultType: questionAttempts.resultType,
        isCorrect: questionAttempts.isCorrect,
      })
      .from(assessmentItems)
      .leftJoin(questionAttempts, eq(questionAttempts.assessmentItemId, assessmentItems.id))
      .where(eq(assessmentItems.sessionId, sessionId))
      .orderBy(asc(assessmentItems.ordinal));
    return rows.map((r) => ({
      id: r.id,
      ordinal: r.ordinal,
      questionVersionId: r.questionVersionId,
      presentedAt: r.presentedAt,
      adaptiveDecisionId: r.adaptiveDecisionId,
      attempt:
        r.attemptId && r.resultType
          ? { id: r.attemptId, resultType: r.resultType, isCorrect: r.isCorrect }
          : null,
    }));
  }

  progress(sessionId: string): Promise<SessionProgress> {
    return progressOf(this.db, sessionId);
  }

  async askedQuestionVersionIds(studentId: string, examId: string): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ questionVersionId: assessmentItems.questionVersionId })
      .from(assessmentItems)
      .innerJoin(assessmentSessions, eq(assessmentSessions.id, assessmentItems.sessionId))
      .where(
        and(eq(assessmentSessions.studentId, studentId), eq(assessmentSessions.examId, examId)),
      );
    return rows.map((r) => r.questionVersionId);
  }

  async answeredQuestionVersionIds(studentId: string, examId: string): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ questionVersionId: assessmentItems.questionVersionId })
      .from(assessmentItems)
      .innerJoin(assessmentSessions, eq(assessmentSessions.id, assessmentItems.sessionId))
      .innerJoin(questionAttempts, eq(questionAttempts.assessmentItemId, assessmentItems.id))
      .where(
        and(
          eq(assessmentSessions.studentId, studentId),
          eq(assessmentSessions.examId, examId),
          eq(questionAttempts.resultType, "ANSWERED"),
        ),
      );
    return rows.map((r) => r.questionVersionId);
  }

  async createSession(input: {
    studentId: string;
    examId: string;
    type: SessionType;
    blueprintId: string | null;
    plannedItemCount?: number;
    targetSkillId?: string;
    scoringVersion: string;
    resultConfigVersion: number | null;
    items: readonly PlannedSessionItem[];
  }): Promise<{ session: Session; created: boolean }> {
    try {
      const session = await this.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(assessmentSessions)
          .values({
            studentId: input.studentId,
            examId: input.examId,
            type: input.type,
            blueprintId: input.blueprintId,
            plannedItemCount: input.plannedItemCount ?? null,
            targetSkillId: input.targetSkillId ?? null,
            scoringVersion: input.scoringVersion,
            resultConfigVersion: input.resultConfigVersion,
          })
          .returning(sessionColumns);
        if (!created) throw new Error("Session insert returned no row.");
        // A training session starts empty: its items are chosen as it goes.
        if (input.items.length === 0) return created;
        await tx.insert(assessmentItems).values(
          input.items.map((item, index) => ({
            sessionId: created.id,
            questionVersionId: item.questionVersionId,
            ordinal: index + 1,
            // A reassessment's questions come from the engine's ranking, not a blueprint.
            selectedBy: input.targetSkillId ? ("FIXED" as const) : ("BLUEPRINT" as const),
          })),
        );
        return created;
      });
      return { session, created: true };
    } catch (error) {
      // A concurrent request opened the same session first: resume that one.
      if (pgErrorInfo(error)?.constraint === "assessment_sessions_one_open") {
        const open = (await this.sessionsFor(input.studentId, input.examId, input.type)).find(
          (s) => s.status === "CREATED" || s.status === "IN_PROGRESS",
        );
        if (open) return { session: open, created: false };
      }
      throw error;
    }
  }

  async start(sessionId: string): Promise<Session> {
    await this.db
      .update(assessmentSessions)
      .set({ status: "IN_PROGRESS", startedAt: sql`now()` })
      .where(and(eq(assessmentSessions.id, sessionId), eq(assessmentSessions.status, "CREATED")));
    const session = await this.findSession(sessionId);
    if (!session) throw new AssessmentNotFound();
    return session;
  }

  async markPresented(itemId: string): Promise<void> {
    await this.db
      .update(assessmentItems)
      .set({ presentedAt: sql`now()` })
      .where(and(eq(assessmentItems.id, itemId), sql`${assessmentItems.presentedAt} IS NULL`));
  }

  async findAttemptByIdempotencyKey(key: string): Promise<StoredAttempt | null> {
    const [row] = await this.db
      .select(attemptColumns)
      .from(questionAttempts)
      .where(eq(questionAttempts.idempotencyKey, key));
    return row ?? null;
  }

  /**
   * The answer path's transaction (ARCHITECTURE.md §7). The session row is
   * locked first, which serializes every submission within one session: two
   * racing requests for the same item cannot both pass the "not answered yet"
   * check, and the auto-completion count is exact.
   */
  async recordAttempt(command: RecordAttemptCommand): Promise<RecordAttemptResult> {
    try {
      return await this.db.transaction(async (tx) => {
        const [session] = await tx
          .select({ status: assessmentSessions.status, type: assessmentSessions.type })
          .from(assessmentSessions)
          .where(eq(assessmentSessions.id, command.sessionId))
          .for("update");
        if (!session) throw new AssessmentNotFound();

        const [existing] = await tx
          .select(attemptColumns)
          .from(questionAttempts)
          .where(eq(questionAttempts.assessmentItemId, command.itemId));
        if (existing) {
          // Same key for the same item: a retry of a request that already
          // succeeded. Return the original outcome, never a second attempt.
          if (existing.idempotencyKey !== command.idempotencyKey) throw new ItemAlreadyAnswered();
          const progress = await progressOf(tx, command.sessionId);
          return {
            kind: "REPLAYED" as const,
            attempt: existing,
            progress,
            completed: session.status === "COMPLETED",
          };
        }
        if (session.status !== "IN_PROGRESS") throw new AssessmentNotActive(session.status);

        const [clock] = await tx.execute<{ now: string }>(sql`SELECT now() AS now`);
        const answeredAt = new Date(clock?.now ?? Date.now());
        const previousAttemptAt = await this.previousAttemptAt(tx, command);

        const { outcome } = command;
        const [attempt] = await tx
          .insert(questionAttempts)
          .values({
            assessmentItemId: command.itemId,
            studentId: command.studentId,
            submittedAnswer:
              outcome.kind === "ANSWERED" ? { optionKeys: outcome.chosenKeys } : null,
            isCorrect: outcome.kind === "ANSWERED" ? outcome.isCorrect : null,
            resultType: outcome.kind,
            responseTimeMs: command.responseTimeMs,
            finalizedAt: answeredAt,
            idempotencyKey: command.idempotencyKey,
          })
          .returning(attemptColumns);
        if (!attempt) throw new Error("Attempt insert returned no row.");

        const eligible: EligibleAttempt = {
          attemptId: attempt.id,
          questionId: command.evidence.questionId,
          result:
            outcome.kind === "ANSWERED"
              ? // No hints or reveals exist in diagnostics yet (ADAPTIVE_ENGINE.md §8).
                {
                  kind: "ANSWERED",
                  isCorrect: outcome.isCorrect,
                  hintUsed: false,
                  answerRevealed: false,
                }
              : { kind: "SKIPPED" },
          difficulty: command.evidence.difficulty,
          answeredAt,
          previousAttemptAt,
        };
        await this.mastery.applyAttemptEvidence(tx, {
          studentId: command.studentId,
          examId: command.examId,
          attempt: eligible,
          targets: command.evidence.targets.map((t) => ({
            skillId: t.skillId,
            subskillId: t.subskillId,
            mapping: { role: t.role, attributionWeight: t.attributionWeight },
            settings: { masteryThreshold: t.masteryThreshold, minCoverage: t.minCoverage },
          })),
        });

        const sessionFacts = {
          sessionId: command.sessionId,
          sessionType: session.type,
          examId: command.examId,
          studentId: command.studentId,
        };
        await writeOutbox(tx, {
          type: OutboxEventType.AttemptRecorded,
          aggregateType: SESSION_AGGREGATE,
          aggregateId: command.sessionId,
          payload: {
            ...sessionFacts,
            itemId: command.itemId,
            attemptId: attempt.id,
            resultType: attempt.resultType,
            isCorrect: attempt.isCorrect,
          },
        });

        const progress = await progressOf(tx, command.sessionId);
        const completed = progress.finalized === progress.total;
        if (completed) {
          await tx
            .update(assessmentSessions)
            .set({ status: "COMPLETED", completedAt: answeredAt })
            .where(eq(assessmentSessions.id, command.sessionId));
          await writeOutbox(tx, {
            type: OutboxEventType.SessionCompleted,
            aggregateType: SESSION_AGGREGATE,
            aggregateId: command.sessionId,
            payload: sessionFacts,
          });
        }
        return { kind: "RECORDED" as const, attempt, progress, completed };
      });
    } catch (error) {
      if (error instanceof DomainError) throw error;
      const info = pgErrorInfo(error);
      if (info?.code === PgErrorCode.uniqueViolation) {
        // The item is guarded by the session lock, so a key collision here
        // means the same key was sent for a different item concurrently.
        if (info.constraint === "question_attempts_idempotency_key_unique") {
          throw new IdempotencyKeyReused();
        }
        if (info.constraint === "question_attempts_item_unique") throw new ItemAlreadyAnswered();
      }
      throw error;
    }
  }

  async complete(sessionId: string, options?: { endingEarly: boolean }): Promise<Session> {
    const progress = await this.progress(sessionId);
    if (!options?.endingEarly && progress.finalized < progress.total) {
      throw new AssessmentIncomplete();
    }
    await this.db.transaction(async (tx) => {
      const [ended] = await tx
        .update(assessmentSessions)
        .set({ status: "COMPLETED", completedAt: sql`now()` })
        .where(
          and(eq(assessmentSessions.id, sessionId), eq(assessmentSessions.status, "IN_PROGRESS")),
        )
        .returning({
          type: assessmentSessions.type,
          examId: assessmentSessions.examId,
          studentId: assessmentSessions.studentId,
        });
      // Only the request that actually ended the session reports it.
      if (ended) {
        await writeOutbox(tx, {
          type: OutboxEventType.SessionCompleted,
          aggregateType: SESSION_AGGREGATE,
          aggregateId: sessionId,
          payload: {
            sessionId,
            sessionType: ended.type,
            examId: ended.examId,
            studentId: ended.studentId,
          },
        });
      }
    });
    const session = await this.findSession(sessionId);
    if (!session) throw new AssessmentNotFound();
    return session;
  }

  appendAdaptiveItem(input: {
    sessionId: string;
    questionVersionId: string;
    recordDecision: (executor: DbExecutor) => Promise<string>;
  }): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      // The same lock as the answer path: appends and answers of one session never interleave.
      const [session] = await tx
        .select({
          status: assessmentSessions.status,
          planned: assessmentSessions.plannedItemCount,
        })
        .from(assessmentSessions)
        .where(eq(assessmentSessions.id, input.sessionId))
        .for("update");
      if (session?.status !== "IN_PROGRESS" || session.planned === null) return false;
      const [counts] = await tx
        .select({ items: count(assessmentItems.id), finalized: count(questionAttempts.id) })
        .from(assessmentItems)
        .leftJoin(questionAttempts, eq(questionAttempts.assessmentItemId, assessmentItems.id))
        .where(eq(assessmentItems.sessionId, input.sessionId));
      const items = counts?.items ?? 0;
      if (items > (counts?.finalized ?? 0) || items >= session.planned) return false;

      const decisionId = await input.recordDecision(tx);
      await tx.insert(assessmentItems).values({
        sessionId: input.sessionId,
        questionVersionId: input.questionVersionId,
        ordinal: items + 1,
        selectedBy: "ADAPTIVE",
        adaptiveDecisionId: decisionId,
      });
      return true;
    });
  }

  /** §9 repeat factor: when this student last answered any version of the same question. */
  private async previousAttemptAt(
    executor: DbExecutor,
    command: RecordAttemptCommand,
  ): Promise<Date | null> {
    if (command.evidence.questionVersionIds.length === 0) return null;
    const [row] = await executor
      .select({ last: max(questionAttempts.createdAt) })
      .from(questionAttempts)
      .innerJoin(assessmentItems, eq(assessmentItems.id, questionAttempts.assessmentItemId))
      .where(
        and(
          eq(questionAttempts.studentId, command.studentId),
          inArray(assessmentItems.questionVersionId, [...command.evidence.questionVersionIds]),
        ),
      );
    return row?.last ?? null;
  }
}

/** A training session's total is its planned count; a planned session's, its items. */
async function progressOf(executor: DbExecutor, sessionId: string): Promise<SessionProgress> {
  const [session] = await executor
    .select({ planned: assessmentSessions.plannedItemCount })
    .from(assessmentSessions)
    .where(eq(assessmentSessions.id, sessionId));
  const [row] = await executor
    .select({ total: count(assessmentItems.id), finalized: count(questionAttempts.id) })
    .from(assessmentItems)
    .leftJoin(questionAttempts, eq(questionAttempts.assessmentItemId, assessmentItems.id))
    .where(eq(assessmentItems.sessionId, sessionId));
  return { total: session?.planned ?? row?.total ?? 0, finalized: row?.finalized ?? 0 };
}
