import { Module } from "@nestjs/common";

import { CatalogModule } from "../catalog/catalog.module.js";
import { QuestionsService } from "./application/questions.service.js";
import { QUESTION_STORE } from "./domain/ports.js";
import { DrizzleQuestionReader } from "./infrastructure/drizzle-question-reader.js";
import { DrizzleQuestionStore } from "./infrastructure/drizzle-question-store.js";
import { AdminQuestionsController } from "./presentation/admin-questions.controller.js";
import { QUESTION_READER } from "./questions.contract.js";

/** Question bank: questions, versions, options, mappings, reviews (DOMAIN_MODEL.md §2). */
@Module({
  // Only the catalog's read contract (CATALOG_LOOKUP) is used.
  imports: [CatalogModule],
  controllers: [AdminQuestionsController],
  providers: [
    QuestionsService,
    { provide: QUESTION_STORE, useClass: DrizzleQuestionStore },
    { provide: QUESTION_READER, useClass: DrizzleQuestionReader },
  ],
  // Other modules read published questions through the contract only.
  exports: [QUESTION_READER],
})
export class QuestionsModule {}
