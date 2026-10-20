import { type DynamicModule, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { DestinationStream } from "pino";

import type { AppConfig } from "./config/app-config.js";
import { ConfigModule } from "./config/config.module.js";
import { DatabaseModule } from "./infrastructure/database/database.module.js";
import { LoggingModule } from "./infrastructure/logging/logging.module.js";
import { RateLimitModule } from "./infrastructure/rate-limit/rate-limit.module.js";
import { AiModule } from "./modules/ai/ai.module.js";
import { AnalyticsModule } from "./modules/analytics/analytics.module.js";
import { AssessmentsModule } from "./modules/assessments/assessments.module.js";
import { AuditModule } from "./modules/audit/audit.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { AuthenticationGuard } from "./modules/auth/presentation/authentication.guard.js";
import { BillingModule } from "./modules/billing/billing.module.js";
import { CatalogModule } from "./modules/catalog/catalog.module.js";
import { ContentImportModule } from "./modules/content-import/content-import.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { QuestionsModule } from "./modules/questions/questions.module.js";
import { PermissionsGuard } from "./modules/rbac/require-permissions.js";
import { SettingsModule } from "./modules/settings/settings.module.js";

export interface AppModuleOptions {
  /** Log sink override, used by tests to capture output. Defaults to stdout. */
  logDestination?: DestinationStream;
}

@Module({})
export class AppModule {
  static forRoot(config: AppConfig, options: AppModuleOptions = {}): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        LoggingModule.forRoot(config, options.logDestination),
        DatabaseModule,
        RateLimitModule,
        AuthModule,
        CatalogModule,
        AssessmentsModule,
        ContentImportModule,
        AiModule,
        AnalyticsModule,
        AuditModule,
        QuestionsModule,
        BillingModule,
        HealthModule,
        SettingsModule,
      ],
      // Global guards run in this order. Rate limiting comes first so that
      // rejected credentials still consume budget; authentication precedes
      // authorization because permissions come from the resolved principal.
      providers: [
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: AuthenticationGuard },
        { provide: APP_GUARD, useClass: PermissionsGuard },
      ],
    };
  }
}
