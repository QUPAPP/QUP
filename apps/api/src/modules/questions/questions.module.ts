import { Module } from "@nestjs/common";

import { CatalogModule } from "../catalog/catalog.module.js";
import { QuestionAuthorService } from "./application/question-author.service.js";
import { QuestionsService } from "./application/questions.service.js";
import { QUESTION_STORE } from "./domain/ports.js";
import { DrizzleQuestionReader } from "./infrastructure/drizzle-question-reader.js";
import { DrizzleQuestionStore } from "./infrastructure/drizzle-question-store.js";
import { AdminQuestionsController } from "./presentation/admin-questions.controller.js";
import { QuestionAuthoringController } from "./presentation/question-authoring.controller.js";
import { QUESTION_AUTHOR, QUESTION_READER } from "./questions.contract.js";

/** Question bank: questions, versions, options, mappings, reviews (DOMAIN_MODEL.md §2). */
@Module({
  // Only the catalog's read contract (CATALOG_LOOKUP) is used.
  imports: [CatalogModule],
  controllers: [AdminQuestionsController, QuestionAuthoringController],
  providers: [
    QuestionsService,
    { provide: QUESTION_STORE, useClass: DrizzleQuestionStore },
    { provide: QUESTION_READER, useClass: DrizzleQuestionReader },
    QuestionAuthorService,
    { provide: QUESTION_AUTHOR, useExisting: QuestionAuthorService },
  ],
  // Other modules read published questions, or write drafts, through the contracts only.
  exports: [QUESTION_READER, QUESTION_AUTHOR],
})
export class QuestionsModule {}
