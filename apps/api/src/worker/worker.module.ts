import { type DynamicModule, Module } from "@nestjs/common";
import type { DestinationStream } from "pino";

import type { AppConfig } from "../config/app-config.js";
import { ConfigModule } from "../config/config.module.js";
import { DatabaseModule } from "../infrastructure/database/database.module.js";
import { LoggingModule } from "../infrastructure/logging/logging.module.js";
import {
  OUTBOX_HANDLERS,
  type OutboxHandler,
  OutboxRelay,
} from "../infrastructure/outbox/outbox-relay.js";
import { AnalyticsModule } from "../modules/analytics/analytics.module.js";
import { LearningEventProjector } from "../modules/analytics/application/learning-event-projector.js";

/**
 * The background worker's composition root (ARCHITECTURE.md "Background
 * Workers"): no HTTP, just the outbox relay and the handlers it feeds.
 */
@Module({})
export class WorkerModule {
  static forRoot(
    config: AppConfig,
    options: { logDestination?: DestinationStream } = {},
  ): DynamicModule {
    return {
      module: WorkerModule,
      imports: [
        ConfigModule.forRoot(config),
        LoggingModule.forRoot(config, options.logDestination),
        DatabaseModule,
        AnalyticsModule,
      ],
      providers: [
        OutboxRelay,
        {
          provide: OUTBOX_HANDLERS,
          inject: [LearningEventProjector],
          useFactory: (projector: LearningEventProjector): OutboxHandler[] => [projector],
        },
      ],
    };
  }
}
