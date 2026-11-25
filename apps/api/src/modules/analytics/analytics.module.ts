import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { BillingModule } from "../billing/billing.module.js";
import { AnalyticsService } from "./application/analytics.service.js";
import { LearningEventProjector } from "./application/learning-event-projector.js";
import { AdminAnalyticsController } from "./presentation/admin-analytics.controller.js";

/**
 * Analytics (AGENTS.md §5): the learning-event stream fed by the outbox (the
 * worker runs the projector) and the learning metrics read from it.
 */
@Module({
  // Contracts only: registrations (USER_DIRECTORY) and purchases (PURCHASE_FACTS) for the funnel.
  imports: [AuthModule, BillingModule],
  controllers: [AdminAnalyticsController],
  providers: [LearningEventProjector, AnalyticsService],
  exports: [LearningEventProjector],
})
export class AnalyticsModule {}
