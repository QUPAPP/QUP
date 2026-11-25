import { Module } from "@nestjs/common";

import { CatalogModule } from "../catalog/catalog.module.js";
import { PassagesService } from "./application/passages.service.js";
import { QuestionAssetsService } from "./application/question-assets.service.js";
import { QuestionAuthorService } from "./application/question-author.service.js";
import { QuestionsService } from "./application/questions.service.js";
import { QUESTION_STORE } from "./domain/ports.js";
import { DrizzlePassageStore, PASSAGE_STORE } from "./infrastructure/drizzle-passage-store.js";
import {
  DrizzleQuestionAssetStore,
  QUESTION_ASSET_STORE,
} from "./infrastructure/drizzle-question-asset-store.js";
import { DrizzleQuestionReader } from "./infrastructure/drizzle-question-reader.js";
import { DrizzleQuestionStore } from "./infrastructure/drizzle-question-store.js";
import { QuestionBankStats } from "./infrastructure/question-bank-stats.js";
import { AdminContentAnalyticsController } from "./presentation/admin-content-analytics.controller.js";
import { AdminPassagesController } from "./presentation/admin-passages.controller.js";
import { AdminQuestionsController } from "./presentation/admin-questions.controller.js";
import {
  AdminQuestionAssetsController,
  QuestionAssetsController,
} from "./presentation/question-assets.controller.js";
import { QuestionAuthoringController } from "./presentation/question-authoring.controller.js";
import { QUESTION_AUTHOR, QUESTION_READER } from "./questions.contract.js";

/** Question bank: questions, versions, options, mappings, reviews (DOMAIN_MODEL.md §2). */
@Module({
  // Only the catalog's read contract (CATALOG_LOOKUP) is used.
  imports: [CatalogModule],
  controllers: [
    AdminQuestionsController,
    QuestionAuthoringController,
    AdminContentAnalyticsController,
    AdminQuestionAssetsController,
    QuestionAssetsController,
    AdminPassagesController,
  ],
  providers: [
    QuestionsService,
    QuestionAssetsService,
    PassagesService,
    { provide: PASSAGE_STORE, useClass: DrizzlePassageStore },
    { provide: QUESTION_ASSET_STORE, useClass: DrizzleQuestionAssetStore },
    { provide: QUESTION_STORE, useClass: DrizzleQuestionStore },
    { provide: QUESTION_READER, useClass: DrizzleQuestionReader },
    QuestionAuthorService,
    QuestionBankStats,
    { provide: QUESTION_AUTHOR, useExisting: QuestionAuthorService },
  ],
  // Other modules read published questions, or write drafts, through the contracts only.
  exports: [QUESTION_READER, QUESTION_AUTHOR],
})
export class QuestionsModule {}
