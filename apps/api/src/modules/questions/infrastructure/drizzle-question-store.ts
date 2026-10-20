import { Inject, Injectable } from "@nestjs/common";
import { type Database, tables } from "@qup/db";
import { and, asc, desc, eq, isNull, max, ne, sql } from "drizzle-orm";

import type { ActorContext } from "../../../common/actor.js";
import { DomainError } from "../../../common/errors/domain-error.js";
import { AuditAction, writeAudit } from "../../../infrastructure/audit/audit-log.js";
import { DATABASE } from "../../../infrastructure/database/database.module.js";
import type { DbExecutor } from "../../../infrastructure/database/executor.js";
import { PgErrorCode, pgErrorInfo } from "../../../infrastructure/database/postgres-errors.js";
import type {
  QuestionListFilter,
  QuestionListItem,
  QuestionStore,
  QuestionSummary,
  QuestionVersionDetail,
  ReviewDecision,
} from "../domain/ports.js";
import type {
  DraftContent,
  QuestionType,
  QuestionVersionStatus,
  RichContent,
} from "../domain/question-content.js";
import {
  QuestionContentInvalid,
  QuestionVersionChanged,
  StableCodeTaken,
  VersionAlreadyInProgress,
} from "../domain/questions.errors.js";

const { questions, questionVersions, questionOptions, questionSkillMappings, contentReviews } =
  tables;

/** Column scales, matching numeric(4,3) and numeric(5,4) in @qup/db. */
const DIFFICULTY_SCALE = 3;
const ATTRIBUTION_SCALE = 4;

const summaryColumns = {
  id: questionVersions.id,
  versionNumber: questionVersions.versionNumber,
  status: questionVersions.status,
  questionType: questionVersions.questionType,
  taxonomyVersionId: questionVersions.taxonomyVersionId,
  updatedAt: questionVersions.updatedAt,
};

const SUPPORTED_TYPES: ReadonlySet<string> = new Set<QuestionType>([
  "SINGLE_CHOICE",
  "MULTIPLE_CHOICE",
  "TRUE_FALSE",
]);

/**
 * The database enum also has NUMERIC / SHORT_ANSWER, which V1 does not support
 * (OPEN_QUESTIONS.md #16c) and the API never writes. Meeting one means data was
 * written some other way; fail loudly rather than mis-render it.
 */
function toQuestionType(value: string): QuestionType {
  if (!SUPPORTED_TYPES.has(value))
    throw new Error(`Unsupported question type in storage: ${value}`);
  return value as QuestionType;
}

/** Constraint and guard violations become domain errors; everything else is rethrown. */
function translate(error: unknown): never {
  if (error instanceof DomainError) throw error;
  const info = pgErrorInfo(error);
  switch (info?.code) {
    case PgErrorCode.uniqueViolation:
      if (info.constraint === "questions_stable_code_unique") throw new StableCodeTaken();
      if (info.constraint === "question_versions_one_in_progress") {
        throw new VersionAlreadyInProgress();
      }
      // Version-number or one-published races: another request got there first.
      throw new QuestionVersionChanged();
    case PgErrorCode.restrictViolation:
      // A lifecycle guard (0007) fired: the status changed under us.
      throw new QuestionVersionChanged();
    case PgErrorCode.checkViolation:
      throw new QuestionContentInvalid([
        {
          path: "",
          rule: "DATABASE_RULE",
          message: "The content violates a database rule (answer key or mapping).",
        },
      ]);
    default:
      throw error;
  }
}

async function guarded<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    translate(error);
  }
}

async function insertVersion(
  executor: DbExecutor,
  input: { questionId: string; versionNumber: number; createdBy: string | null },
  content: DraftContent,
): Promise<string> {
  const [version] = await executor
    .insert(questionVersions)
    .values({
      questionId: input.questionId,
      versionNumber: input.versionNumber,
      questionType: content.questionType,
      stemContent: content.stem,
      explanationContent: content.explanation,
      difficultyAuthorScore: content.difficulty.toFixed(DIFFICULTY_SCALE),
      taxonomyVersionId: content.taxonomyVersionId,
      sourceType: content.sourceType,
      sourceReference: content.sourceReference,
      createdBy: input.createdBy,
    })
    .returning({ id: questionVersions.id });
  if (!version) throw new Error("Question version insert returned no row.");
  await insertChildren(executor, version.id, content);
  return version.id;
}

async function insertChildren(
  executor: DbExecutor,
  versionId: string,
  content: DraftContent,
): Promise<void> {
  if (content.options.length > 0) {
    await executor.insert(questionOptions).values(
      content.options.map((option) => ({
        questionVersionId: versionId,
        key: option.key,
        content: option.content,
        isCorrect: option.isCorrect,
        displayOrder: option.displayOrder,
      })),
    );
  }
  if (content.mappings.length > 0) {
    await executor.insert(questionSkillMappings).values(
      content.mappings.map((mapping) => ({
        questionVersionId: versionId,
        skillId: mapping.skillId,
        subskillId: mapping.subskillId,
        role: mapping.role,
        attributionWeight: mapping.attributionWeight.toFixed(ATTRIBUTION_SCALE),
        rationale: mapping.rationale,
      })),
    );
  }
}

@Injectable()
export class DrizzleQuestionStore implements QuestionStore {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async createQuestion(
    input: { stableCode: string; createdBy: string | null },
    content: DraftContent,
  ): Promise<QuestionVersionDetail> {
    const versionId = await guarded(() =>
      this.db.transaction(async (tx) => {
        const [question] = await tx
          .insert(questions)
          .values({ stableCode: input.stableCode, createdBy: input.createdBy })
          .returning({ id: questions.id });
        if (!question) throw new Error("Question insert returned no row.");
        return insertVersion(
          tx,
          { questionId: question.id, versionNumber: 1, createdBy: input.createdBy },
          content,
        );
      }),
    );
    return this.requireVersion(versionId);
  }

  async findQuestion(questionId: string): Promise<QuestionSummary | null> {
    const [question] = await this.db
      .select({
        id: questions.id,
        stableCode: questions.stableCode,
        archivedAt: questions.archivedAt,
        createdAt: questions.createdAt,
      })
      .from(questions)
      .where(eq(questions.id, questionId));
    if (!question) return null;

    const versions = await this.db
      .select(summaryColumns)
      .from(questionVersions)
      .where(eq(questionVersions.questionId, questionId))
      .orderBy(desc(questionVersions.versionNumber));
    return {
      ...question,
      versions: versions.map((v) => ({ ...v, questionType: toQuestionType(v.questionType) })),
    };
  }

  async listQuestions(
    filter: QuestionListFilter,
  ): Promise<{ items: QuestionListItem[]; total: number }> {
    // Each question is listed once, described by its newest version.
    const conditions = [sql`TRUE`];
    if (filter.status) conditions.push(sql`l.status = ${filter.status}`);
    if (filter.taxonomyVersionId) {
      conditions.push(sql`l.taxonomy_version_id = ${filter.taxonomyVersionId}`);
    }
    const where = sql.join(conditions, sql` AND `);
    const latest = sql`
      SELECT DISTINCT ON (question_id)
        id, question_id, version_number, status, question_type, taxonomy_version_id, updated_at
      FROM question_versions
      ORDER BY question_id, version_number DESC`;

    const rows = await this.db.execute<{
      id: string;
      stable_code: string;
      archived_at: string | null;
      version_id: string;
      version_number: number;
      status: QuestionVersionStatus;
      question_type: string;
      taxonomy_version_id: string;
      updated_at: string;
    }>(sql`
      SELECT q.id, q.stable_code, q.archived_at,
             l.id AS version_id, l.version_number, l.status, l.question_type,
             l.taxonomy_version_id, l.updated_at
      FROM questions q JOIN (${latest}) l ON l.question_id = q.id
      WHERE ${where}
      ORDER BY q.created_at DESC, q.id
      LIMIT ${filter.limit} OFFSET ${filter.offset}`);

    const [count] = await this.db.execute<{ total: number }>(sql`
      SELECT count(*)::int AS total
      FROM questions q JOIN (${latest}) l ON l.question_id = q.id
      WHERE ${where}`);

    return {
      total: count?.total ?? 0,
      items: rows.map((r) => ({
        id: r.id,
        stableCode: r.stable_code,
        archivedAt: r.archived_at ? new Date(r.archived_at) : null,
        latestVersion: {
          id: r.version_id,
          versionNumber: r.version_number,
          status: r.status,
          questionType: toQuestionType(r.question_type),
          taxonomyVersionId: r.taxonomy_version_id,
          updatedAt: new Date(r.updated_at),
        },
      })),
    };
  }

  async findVersion(versionId: string): Promise<QuestionVersionDetail | null> {
    const [version] = await this.db
      .select()
      .from(questionVersions)
      .where(eq(questionVersions.id, versionId));
    if (!version) return null;

    const [options, mappings, reviews] = await Promise.all([
      this.db
        .select()
        .from(questionOptions)
        .where(eq(questionOptions.questionVersionId, versionId))
        .orderBy(asc(questionOptions.displayOrder), asc(questionOptions.key)),
      this.db
        .select()
        .from(questionSkillMappings)
        .where(eq(questionSkillMappings.questionVersionId, versionId))
        .orderBy(asc(questionSkillMappings.createdAt)),
      this.db
        .select()
        .from(contentReviews)
        .where(eq(contentReviews.questionVersionId, versionId))
        .orderBy(asc(contentReviews.createdAt)),
    ]);

    return {
      id: version.id,
      questionId: version.questionId,
      versionNumber: version.versionNumber,
      status: version.status,
      questionType: toQuestionType(version.questionType),
      stem: version.stemContent as RichContent,
      explanation: (version.explanationContent as RichContent | null) ?? null,
      difficulty: Number(version.difficultyAuthorScore),
      taxonomyVersionId: version.taxonomyVersionId,
      sourceType: version.sourceType,
      sourceReference: version.sourceReference,
      publishedAt: version.publishedAt,
      createdAt: version.createdAt,
      updatedAt: version.updatedAt,
      options: options.map((o) => ({
        key: o.key,
        content: o.content as RichContent,
        isCorrect: o.isCorrect,
        displayOrder: o.displayOrder,
      })),
      mappings: mappings.map((m) => ({
        skillId: m.skillId,
        subskillId: m.subskillId,
        role: m.role,
        attributionWeight: Number(m.attributionWeight),
        rationale: m.rationale,
      })),
      reviews: reviews.map((r) => ({
        reviewerId: r.reviewerId,
        decision: r.decision as ReviewDecision,
        notes: r.notes,
        createdAt: r.createdAt,
      })),
    };
  }

  async createNextVersion(
    questionId: string,
    copyFrom: QuestionVersionDetail,
    createdBy: string | null,
  ): Promise<QuestionVersionDetail> {
    const versionId = await guarded(() =>
      this.db.transaction(async (tx) => {
        const [row] = await tx
          .select({ latest: max(questionVersions.versionNumber) })
          .from(questionVersions)
          .where(eq(questionVersions.questionId, questionId));
        return insertVersion(
          tx,
          { questionId, versionNumber: (row?.latest ?? 0) + 1, createdBy },
          copyFrom,
        );
      }),
    );
    return this.requireVersion(versionId);
  }

  replaceDraftContent(versionId: string, content: DraftContent): Promise<void> {
    return guarded(() =>
      this.db.transaction(async (tx) => {
        const [updated] = await tx
          .update(questionVersions)
          .set({
            questionType: content.questionType,
            stemContent: content.stem,
            explanationContent: content.explanation,
            difficultyAuthorScore: content.difficulty.toFixed(DIFFICULTY_SCALE),
            taxonomyVersionId: content.taxonomyVersionId,
            sourceType: content.sourceType,
            sourceReference: content.sourceReference,
          })
          .where(and(eq(questionVersions.id, versionId), eq(questionVersions.status, "DRAFT")))
          .returning({ id: questionVersions.id });
        if (!updated) throw new QuestionVersionChanged();

        await tx.delete(questionOptions).where(eq(questionOptions.questionVersionId, versionId));
        await tx
          .delete(questionSkillMappings)
          .where(eq(questionSkillMappings.questionVersionId, versionId));
        await insertChildren(tx, versionId, content);
      }),
    );
  }

  transition(
    versionId: string,
    from: QuestionVersionStatus,
    to: QuestionVersionStatus,
  ): Promise<void> {
    return guarded(() => this.transitionWith(this.db, versionId, from, to));
  }

  recordReview(
    versionId: string,
    review: { reviewerId: string | null; decision: ReviewDecision; notes: string | null },
    nextStatus: QuestionVersionStatus,
  ): Promise<void> {
    return guarded(() =>
      this.db.transaction(async (tx) => {
        await tx.insert(contentReviews).values({ questionVersionId: versionId, ...review });
        await this.transitionWith(tx, versionId, "UNDER_REVIEW", nextStatus);
      }),
    );
  }

  publish(version: QuestionVersionDetail, actor: ActorContext): Promise<void> {
    return guarded(() =>
      this.db.transaction(async (tx) => {
        const archived = await tx
          .update(questionVersions)
          .set({ status: "ARCHIVED" })
          .where(
            and(
              eq(questionVersions.questionId, version.questionId),
              eq(questionVersions.status, "PUBLISHED"),
              ne(questionVersions.id, version.id),
            ),
          )
          .returning({ id: questionVersions.id });

        const [published] = await tx
          .update(questionVersions)
          .set({ status: "PUBLISHED", publishedAt: sql`now()` })
          .where(and(eq(questionVersions.id, version.id), eq(questionVersions.status, "APPROVED")))
          .returning({ id: questionVersions.id });
        if (!published) throw new QuestionVersionChanged();

        await writeAudit(tx, actor, {
          action: AuditAction.QuestionPublished,
          resourceType: "question_version",
          resourceId: version.id,
          metadata: {
            questionId: version.questionId,
            versionNumber: version.versionNumber,
            archivedVersionId: archived[0]?.id ?? null,
          },
        });
      }),
    );
  }

  archiveQuestion(questionId: string, actor: ActorContext): Promise<void> {
    return guarded(() =>
      this.db.transaction(async (tx) => {
        const [question] = await tx
          .update(questions)
          .set({ archivedAt: sql`now()` })
          .where(and(eq(questions.id, questionId), isNull(questions.archivedAt)))
          .returning({ id: questions.id });
        if (!question) return; // archived concurrently: nothing left to do

        const versions = await tx
          .update(questionVersions)
          .set({ status: "ARCHIVED" })
          .where(
            and(
              eq(questionVersions.questionId, questionId),
              ne(questionVersions.status, "ARCHIVED"),
            ),
          )
          .returning({ id: questionVersions.id });

        await writeAudit(tx, actor, {
          action: AuditAction.QuestionArchived,
          resourceType: "question",
          resourceId: questionId,
          metadata: { versionsArchived: versions.length },
        });
      }),
    );
  }

  private async transitionWith(
    executor: DbExecutor,
    versionId: string,
    from: QuestionVersionStatus,
    to: QuestionVersionStatus,
  ): Promise<void> {
    const [row] = await executor
      .update(questionVersions)
      .set({ status: to })
      .where(and(eq(questionVersions.id, versionId), eq(questionVersions.status, from)))
      .returning({ id: questionVersions.id });
    if (!row) throw new QuestionVersionChanged();
  }

  private async requireVersion(versionId: string): Promise<QuestionVersionDetail> {
    const version = await this.findVersion(versionId);
    if (!version) throw new Error(`Question version ${versionId} vanished after being written.`);
    return version;
  }
}
