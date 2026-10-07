import { Module } from "@nestjs/common";

import { BillingModule } from "../billing/billing.module.js";
import { CatalogModule } from "../catalog/catalog.module.js";
import { MasteryModule } from "../mastery/mastery.module.js";
import { QuestionsModule } from "../questions/questions.module.js";
import { AssessmentsService } from "./application/assessments.service.js";
import { ASSESSMENT_STORE } from "./domain/ports.js";
import { DrizzleAssessmentStore } from "./infrastructure/drizzle-assessment-store.js";
import { AssessmentsController } from "./presentation/assessments.controller.js";

/**
 * Assessment sessions, items and attempts (DOMAIN_MODEL.md §2 "Assessment").
 * Reads other modules only through their contracts (catalog, questions, billing) and
 * writes mastery through the mastery module's writer, in its own transaction.
 */
@Module({
  imports: [CatalogModule, QuestionsModule, MasteryModule, BillingModule],
  controllers: [AssessmentsController],
  providers: [AssessmentsService, { provide: ASSESSMENT_STORE, useClass: DrizzleAssessmentStore }],
})
export class AssessmentsModule {}
