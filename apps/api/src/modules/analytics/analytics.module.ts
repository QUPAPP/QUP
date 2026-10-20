import { Module } from "@nestjs/common";

import { LearningEventProjector } from "./application/learning-event-projector.js";

/**
 * Analytics (AGENTS.md §5): the learning-event stream fed by the outbox, and
 * the admin metrics read from the source tables.
 */
@Module({
  providers: [LearningEventProjector],
  exports: [LearningEventProjector],
})
export class AnalyticsModule {}
