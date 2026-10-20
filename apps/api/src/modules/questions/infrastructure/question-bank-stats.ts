import { Inject, Injectable } from "@nestjs/common";
import { type Database, tables } from "@qup/db";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { DATABASE } from "../../../infrastructure/database/database.module.js";

const { questions, questionVersions, questionSkillMappings } = tables;

/** Bank-wide counts for the content metrics; bounded queries, no per-question work. */
@Injectable()
export class QuestionBankStats {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Each question counted once, under its newest version's status. */
  async latestStatusCounts(): Promise<Record<string, number>> {
    const rows = await this.db.execute<{ status: string; count: number }>(sql`
      SELECT status, count(*)::int AS count FROM (
        SELECT DISTINCT ON (${questionVersions.questionId}) ${questionVersions.status} AS status
        FROM ${questionVersions}
        ORDER BY ${questionVersions.questionId}, ${questionVersions.versionNumber} DESC
      ) latest
      GROUP BY status`);
    return Object.fromEntries(rows.map((row) => [row.status, row.count]));
  }

  /** Published, non-archived questions per node of their PRIMARY mapping. */
  async publishedPerNode(skillIds: readonly string[], subskillIds: readonly string[]) {
    const onNodes = or(
      skillIds.length ? inArray(questionSkillMappings.skillId, [...skillIds]) : undefined,
      subskillIds.length ? inArray(questionSkillMappings.subskillId, [...subskillIds]) : undefined,
    );
    if (!onNodes) return new Map<string, number>();
    const rows = await this.db
      .select({
        node: sql<string>`coalesce(${questionSkillMappings.skillId}, ${questionSkillMappings.subskillId})`,
        count: sql<number>`count(DISTINCT ${questionVersions.questionId})::int`,
      })
      .from(questionSkillMappings)
      .innerJoin(questionVersions, eq(questionVersions.id, questionSkillMappings.questionVersionId))
      .innerJoin(questions, eq(questions.id, questionVersions.questionId))
      .where(
        and(
          onNodes,
          eq(questionSkillMappings.role, "PRIMARY"),
          eq(questionVersions.status, "PUBLISHED"),
          isNull(questions.archivedAt),
        ),
      )
      .groupBy(
        sql`coalesce(${questionSkillMappings.skillId}, ${questionSkillMappings.subskillId})`,
      );
    return new Map(rows.map((row) => [row.node, row.count]));
  }
}
