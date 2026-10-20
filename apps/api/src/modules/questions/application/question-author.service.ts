import { Inject, Injectable } from "@nestjs/common";
import { type Database, tables } from "@qup/db";
import { and, eq, isNull, ne } from "drizzle-orm";

import type { ActorContext } from "../../../common/actor.js";
import { DATABASE } from "../../../infrastructure/database/database.module.js";
import { publishabilityProblems, structuralProblems } from "../domain/content-rules.js";
import type { DraftContent, RichContent } from "../domain/question-content.js";
import type { QuestionAuthor } from "../questions.contract.js";
import { QuestionsService } from "./questions.service.js";

const { questions, questionVersions, taxonomyVersions } = tables;

/** The questions module's write contract for other modules (QUESTION_AUTHOR). */
@Injectable()
export class QuestionAuthorService implements QuestionAuthor {
  constructor(
    private readonly questions: QuestionsService,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  contentProblems(content: DraftContent) {
    return [...structuralProblems(content), ...publishabilityProblems(content)];
  }

  async createDraft(content: DraftContent, actor: ActorContext) {
    const version = await this.questions.create({ stableCode: undefined, content }, actor);
    return { questionId: version.questionId, versionId: version.id };
  }

  async stemTextsInExam(examId: string) {
    const rows = await this.db
      .select({ questionId: questions.id, stem: questionVersions.stemContent })
      .from(questionVersions)
      .innerJoin(questions, eq(questions.id, questionVersions.questionId))
      .innerJoin(taxonomyVersions, eq(taxonomyVersions.id, questionVersions.taxonomyVersionId))
      .where(
        and(
          eq(taxonomyVersions.examId, examId),
          isNull(questions.archivedAt),
          ne(questionVersions.status, "ARCHIVED"),
        ),
      );
    return rows.map((row) => ({
      questionId: row.questionId,
      text: plainText(row.stem as RichContent),
    }));
  }
}

/** Text and math sources in order: what a duplicate check compares. */
function plainText(content: RichContent): string {
  return content.blocks
    .map((block) => (block.type === "text" ? block.text : block.latex))
    .join(" ");
}
