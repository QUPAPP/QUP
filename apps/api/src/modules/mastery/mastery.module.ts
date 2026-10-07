import { Module } from "@nestjs/common";

import { MasteryWriter } from "./infrastructure/mastery-writer.js";

/**
 * Mastery (DOMAIN_MODEL.md §2): student mastery states and the immutable
 * evidence ledger. The calculation itself is @qup/adaptive-engine; this module
 * only persists its results, inside the caller's transaction.
 */
@Module({
  providers: [MasteryWriter],
  exports: [MasteryWriter],
})
export class MasteryModule {}
