import { type DynamicModule, Global, Module } from "@nestjs/common";

import { APP_CONFIG, type AppConfig } from "./app-config.js";

/**
 * Makes the already-validated configuration injectable everywhere.
 * Validation happens before Nest starts (see main.ts), not lazily here.
 */
@Global()
@Module({})
export class ConfigModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: APP_CONFIG, useValue: config }],
      exports: [APP_CONFIG],
    };
  }
}
