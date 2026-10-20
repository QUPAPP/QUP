import { Module } from "@nestjs/common";

import { AdaptiveModule } from "../adaptive/adaptive.module.js";
import { BillingModule } from "../billing/billing.module.js";
import { CatalogModule } from "../catalog/catalog.module.js";
import { MasteryModule } from "../mastery/mastery.module.js";
import { QuestionsModule } from "../questions/questions.module.js";
import { SettingsModule } from "../settings/settings.module.js";
import { AssessmentsService } from "./application/assessments.service.js";
import { BlueprintsService } from "./application/blueprints.service.js";
import { StudentDashboardService } from "./application/student-dashboard.service.js";
import { ASSESSMENT_STORE, BLUEPRINT_STORE } from "./domain/ports.js";
import { DrizzleAssessmentStore } from "./infrastructure/drizzle-assessment-store.js";
import { DrizzleBlueprintStore } from "./infrastructure/drizzle-blueprint-store.js";
import { AdminBlueprintsController } from "./presentation/admin-blueprints.controller.js";
import { AssessmentsController } from "./presentation/assessments.controller.js";
import { MeController } from "./presentation/me.controller.js";

/**
 * Assessment sessions, items and attempts (DOMAIN_MODEL.md §2 "Assessment").
 * Reads other modules only through their contracts (catalog, questions, billing) and
 * writes mastery through the mastery module's writer, in its own transaction.
 */
@Module({
  imports: [
    CatalogModule,
    QuestionsModule,
    MasteryModule,
    BillingModule,
    SettingsModule,
    AdaptiveModule,
  ],
  controllers: [AssessmentsController, AdminBlueprintsController, MeController],
  providers: [
    AssessmentsService,
    BlueprintsService,
    StudentDashboardService,
    { provide: ASSESSMENT_STORE, useClass: DrizzleAssessmentStore },
    { provide: BLUEPRINT_STORE, useClass: DrizzleBlueprintStore },
  ],
})
export class AssessmentsModule {}
