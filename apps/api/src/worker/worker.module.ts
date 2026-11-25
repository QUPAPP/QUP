import { type DynamicModule, Module } from "@nestjs/common";
import type { DestinationStream } from "pino";

import type { AppConfig } from "../config/app-config.js";
import { ConfigModule } from "../config/config.module.js";
import { DatabaseModule } from "../infrastructure/database/database.module.js";
import { LoggingModule } from "../infrastructure/logging/logging.module.js";
import { RetentionSweeper } from "../infrastructure/maintenance/retention-sweeper.js";
import {
  OUTBOX_HANDLERS,
  type OutboxHandler,
  OutboxRelay,
} from "../infrastructure/outbox/outbox-relay.js";
import { AnalyticsModule } from "../modules/analytics/analytics.module.js";
import { LearningEventProjector } from "../modules/analytics/application/learning-event-projector.js";
import { BillingModule } from "../modules/billing/billing.module.js";
import { EmailNotificationHandler } from "../modules/notifications/application/email-notification.handler.js";
import { NotificationsModule } from "../modules/notifications/notifications.module.js";
import { MaintenanceScheduler } from "./maintenance-scheduler.js";

/**
 * The background worker's composition root (ARCHITECTURE.md "Background
 * Workers"): no HTTP — the outbox relay with the handlers it feeds, and the
 * periodic maintenance jobs (maintenance-scheduler.ts).
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
        NotificationsModule,
        BillingModule,
      ],
      providers: [
        OutboxRelay,
        RetentionSweeper,
        MaintenanceScheduler,
        {
          provide: OUTBOX_HANDLERS,
          inject: [LearningEventProjector, EmailNotificationHandler],
          useFactory: (
            projector: LearningEventProjector,
            notifications: EmailNotificationHandler,
          ): OutboxHandler[] => [projector, notifications],
        },
      ],
    };
  }
}
