import { Inject, Injectable } from "@nestjs/common";
import { type Database, tables } from "@qup/db";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import { DATABASE } from "../../../infrastructure/database/database.module.js";
import type { QuestionType, RichContent } from "../domain/question-content.js";
import type {
  DeliverableQuestion,
  QuestionCandidate,
  QuestionReader,
} from "../questions.contract.js";

const { questions, questionVersions, questionOptions, questionSkillMappings } = tables;

const CHOICE_TYPES: ReadonlySet<string> = new Set([
  "SINGLE_CHOICE",
  "MULTIPLE_CHOICE",
  "TRUE_FALSE",
]);

@Injectable()
export class DrizzleQuestionReader implements QuestionReader {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async publishedCandidates(taxonomyVersionId: string): Promise<QuestionCandidate[]> {
    const rows = await this.db
      .select({
        questionVersionId: questionVersions.id,
        questionId: questionVersions.questionId,
        questionType: questionVersions.questionType,
        difficulty: questionVersions.difficultyAuthorScore,
        primarySkillId: questionSkillMappings.skillId,
        primarySubskillId: questionSkillMappings.subskillId,
      })
      .from(questionVersions)
      .innerJoin(questions, eq(questions.id, questionVersions.questionId))
      .innerJoin(
        questionSkillMappings,
        and(
          eq(questionSkillMappings.questionVersionId, questionVersions.id),
          eq(questionSkillMappings.role, "PRIMARY"),
        ),
      )
      .where(
        and(
          eq(questionVersions.taxonomyVersionId, taxonomyVersionId),
          eq(questionVersions.status, "PUBLISHED"),
          isNull(questions.archivedAt),
        ),
      );

    return rows
      .filter((r) => CHOICE_TYPES.has(r.questionType))
      .map((r) => ({
        questionVersionId: r.questionVersionId,
        questionId: r.questionId,
        // V1 samples on the author's estimate; calibrated difficulty is kept
        // separately and not used until calibration exists (ADAPTIVE_ENGINE.md §4).
        difficulty: Number(r.difficulty),
        primarySkillId: r.primarySkillId,
        primarySubskillId: r.primarySubskillId,
      }));
  }

  async primaryTargetsOf(
    questionVersionIds: readonly string[],
  ): Promise<Map<string, { skillId: string | null; subskillId: string | null }>> {
    if (questionVersionIds.length === 0) return new Map();
    const rows = await this.db
      .select({
        questionVersionId: questionSkillMappings.questionVersionId,
        skillId: questionSkillMappings.skillId,
        subskillId: questionSkillMappings.subskillId,
      })
      .from(questionSkillMappings)
      .where(
        and(
          inArray(questionSkillMappings.questionVersionId, [...questionVersionIds]),
          eq(questionSkillMappings.role, "PRIMARY"),
        ),
      );
    return new Map(
      rows.map((r) => [r.questionVersionId, { skillId: r.skillId, subskillId: r.subskillId }]),
    );
  }

  async questionIdsOf(questionVersionIds: readonly string[]): Promise<Map<string, string>> {
    if (questionVersionIds.length === 0) return new Map();
    const rows = await this.db
      .select({ id: questionVersions.id, questionId: questionVersions.questionId })
      .from(questionVersions)
      .where(inArray(questionVersions.id, [...questionVersionIds]));
    return new Map(rows.map((r) => [r.id, r.questionId]));
  }

  async versionIdsOf(questionId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: questionVersions.id })
      .from(questionVersions)
      .where(eq(questionVersions.questionId, questionId));
    return rows.map((r) => r.id);
  }

  /** Three queries for any number of versions (PRD §16: no N+1). */
  async forDelivery(
    questionVersionIds: readonly string[],
  ): Promise<Map<string, DeliverableQuestion>> {
    const result = new Map<string, DeliverableQuestion>();
    if (questionVersionIds.length === 0) return result;
    const ids = [...questionVersionIds];

    const [versions, options, mappings] = await Promise.all([
      this.db.select().from(questionVersions).where(inArray(questionVersions.id, ids)),
      this.db
        .select()
        .from(questionOptions)
        .where(inArray(questionOptions.questionVersionId, ids))
        .orderBy(asc(questionOptions.displayOrder), asc(questionOptions.key)),
      this.db
        .select()
        .from(questionSkillMappings)
        .where(inArray(questionSkillMappings.questionVersionId, ids)),
    ]);

    for (const v of versions) {
      if (!CHOICE_TYPES.has(v.questionType)) {
        throw new Error(`Unsupported question type in storage: ${v.questionType}`);
      }
      result.set(v.id, {
        questionVersionId: v.id,
        questionId: v.questionId,
        questionType: v.questionType as QuestionType,
        stem: v.stemContent as RichContent,
        explanation: (v.explanationContent as RichContent | null) ?? null,
        difficulty: Number(v.difficultyAuthorScore),
        options: options
          .filter((o) => o.questionVersionId === v.id)
          .map((o) => ({
            key: o.key,
            content: o.content as RichContent,
            isCorrect: o.isCorrect,
            displayOrder: o.displayOrder,
          })),
        mappings: mappings
          .filter((m) => m.questionVersionId === v.id)
          .map((m) => ({
            skillId: m.skillId,
            subskillId: m.subskillId,
            role: m.role,
            attributionWeight: Number(m.attributionWeight),
          })),
      });
    }
    return result;
  }
}
