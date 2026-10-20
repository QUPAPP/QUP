import { Module } from "@nestjs/common";
import { FakeAiProvider } from "@qup/ai-gateway";

import { APP_CONFIG, type AppConfig } from "../../config/app-config.js";
import { AuthModule } from "../auth/auth.module.js";
import { CatalogModule } from "../catalog/catalog.module.js";
import { QuestionsModule } from "../questions/questions.module.js";
import { AI_PROVIDER } from "./ai.contract.js";
import { AiAssistantService } from "./application/ai-assistant.service.js";
import { AI_RUN_STORE } from "./domain/ports.js";
import { DrizzleAiRunStore } from "./infrastructure/drizzle-ai-run-store.js";
import { AdminAiController } from "./presentation/admin-ai.controller.js";

/**
 * AI (AGENTS.md §5 "ai", AI_INTEGRATION.md): advisory AI for question authors
 * through @qup/ai-gateway. Owns ai_runs; reads questions, the catalog and
 * account names only through their contracts. Never decides mastery,
 * publishes or grades.
 */
@Module({
  imports: [QuestionsModule, CatalogModule, AuthModule],
  controllers: [AdminAiController],
  providers: [
    AiAssistantService,
    { provide: AI_RUN_STORE, useClass: DrizzleAiRunStore },
    {
      provide: AI_PROVIDER,
      inject: [APP_CONFIG],
      // Real providers wait for OPEN_QUESTIONS.md #17; production defaults to none.
      useFactory: (config: AppConfig) =>
        config.ai.provider === "fake" ? new FakeAiProvider() : null,
    },
  ],
})
export class AiModule {}
