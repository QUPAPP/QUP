import { Module } from "@nestjs/common";
import { FakeAiProvider } from "@qup/ai-gateway";

import { APP_CONFIG, type AppConfig } from "../../config/app-config.js";
import { AssessmentsModule } from "../assessments/assessments.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { CatalogModule } from "../catalog/catalog.module.js";
import { QuestionsModule } from "../questions/questions.module.js";
import { AI_PROVIDER } from "./ai.contract.js";
import { AiAssistantService } from "./application/ai-assistant.service.js";
import { AiRunner } from "./application/ai-runner.service.js";
import { StudentTutorService } from "./application/student-tutor.service.js";
import { AI_RUN_STORE } from "./domain/ports.js";
import { AnthropicAiProvider } from "./infrastructure/anthropic-provider.js";
import { DrizzleAiRunStore } from "./infrastructure/drizzle-ai-run-store.js";
import { OpenAiCompatibleProvider } from "./infrastructure/openai-compatible-provider.js";
import { AdminAiController } from "./presentation/admin-ai.controller.js";
import { StudentAiController } from "./presentation/student-ai.controller.js";

/**
 * AI (AGENTS.md §5 "ai", AI_INTEGRATION.md): advisory AI for question authors
 * and, when turned on, explanations of a student's own mistakes, through
 * @qup/ai-gateway. Owns ai_runs; reads questions, the catalog, assessments and
 * account names only through their contracts. Never decides mastery,
 * publishes or grades.
 */
@Module({
  imports: [QuestionsModule, CatalogModule, AuthModule, AssessmentsModule],
  controllers: [AdminAiController, StudentAiController],
  providers: [
    AiRunner,
    AiAssistantService,
    StudentTutorService,
    { provide: AI_RUN_STORE, useClass: DrizzleAiRunStore },
    {
      provide: AI_PROVIDER,
      inject: [APP_CONFIG],
      // Production defaults to none until an operator sets AI_PROVIDER (OPEN_QUESTIONS.md #17).
      useFactory: (config: AppConfig) => {
        const provider = config.ai.provider;
        if (provider?.kind === "fake") return new FakeAiProvider();
        if (provider?.kind === "anthropic") return new AnthropicAiProvider(provider);
        if (provider?.kind === "openai-compatible") return new OpenAiCompatibleProvider(provider);
        return null;
      },
    },
  ],
})
export class AiModule {}
