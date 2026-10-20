import { Module } from "@nestjs/common";

import { AnalyticsService } from "./application/analytics.service.js";
import { LearningEventProjector } from "./application/learning-event-projector.js";
import { AdminAnalyticsController } from "./presentation/admin-analytics.controller.js";

/**
 * Analytics (AGENTS.md §5): the learning-event stream fed by the outbox (the
 * worker runs the projector) and the learning metrics read from it.
 */
@Module({
  controllers: [AdminAnalyticsController],
  providers: [LearningEventProjector, AnalyticsService],
  exports: [LearningEventProjector],
})
export class AnalyticsModule {}
