import { Module } from "@nestjs/common";

import { CatalogModule } from "../catalog/catalog.module.js";
import { MasteryModule } from "../mastery/mastery.module.js";
import { QuestionsModule } from "../questions/questions.module.js";
import { ADAPTIVE_RANDOM, ADAPTIVE_SELECTOR } from "./adaptive.contract.js";
import { AdaptiveSelectorService } from "./application/adaptive-selector.service.js";
import { DrizzleDecisionStore } from "./infrastructure/drizzle-decision-store.js";

/**
 * Adaptive selection (AGENTS.md §5 "adaptive"): what to train next, and the
 * auditable decision behind it. Reads mastery, catalog and questions through
 * their contracts; assessments reads this one.
 */
@Module({
  imports: [CatalogModule, QuestionsModule, MasteryModule],
  providers: [
    AdaptiveSelectorService,
    DrizzleDecisionStore,
    { provide: ADAPTIVE_SELECTOR, useExisting: AdaptiveSelectorService },
    { provide: ADAPTIVE_RANDOM, useValue: Math.random },
  ],
  exports: [ADAPTIVE_SELECTOR],
})
export class AdaptiveModule {}
