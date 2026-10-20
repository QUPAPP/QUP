import { Module } from "@nestjs/common";

import { SettingsService } from "./application/settings.service.js";
import { SETTINGS_STORE } from "./domain/ports.js";
import { DrizzleSettingsStore } from "./infrastructure/drizzle-settings-store.js";
import { AdminSettingsController } from "./presentation/admin-settings.controller.js";
import { SETTINGS_READER } from "./settings.contract.js";

/** Versioned, typed system settings (ERD.md "system_settings"). */
@Module({
  controllers: [AdminSettingsController],
  providers: [
    SettingsService,
    { provide: SETTINGS_STORE, useClass: DrizzleSettingsStore },
    { provide: SETTINGS_READER, useExisting: SettingsService },
  ],
  // Other modules read settings through the contract only.
  exports: [SETTINGS_READER],
})
export class SettingsModule {}
