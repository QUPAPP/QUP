import { Module } from "@nestjs/common";

import { BillingModule } from "../billing/billing.module.js";
import { CatalogModule } from "../catalog/catalog.module.js";
import { SkillProfileService } from "./application/skill-profile.service.js";
import { DrizzleMasteryReader } from "./infrastructure/drizzle-mastery-reader.js";
import { MasteryWriter } from "./infrastructure/mastery-writer.js";
import { SkillProfileController } from "./presentation/skill-profile.controller.js";

/**
 * Mastery (DOMAIN_MODEL.md §2): student mastery states and the immutable
 * evidence ledger. The calculation itself is @qup/adaptive-engine; this module
 * persists its results inside the caller's transaction, and reads them back as
 * the student's skill profile (taxonomy and access through their contracts).
 */
@Module({
  imports: [CatalogModule, BillingModule],
  controllers: [SkillProfileController],
  providers: [MasteryWriter, DrizzleMasteryReader, SkillProfileService],
  exports: [MasteryWriter],
})
export class MasteryModule {}
