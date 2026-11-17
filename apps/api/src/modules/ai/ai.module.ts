import { Module } from "@nestjs/common";
import { FakeAiProvider } from "@qup/ai-gateway";

import { APP_CONFIG, type AppConfig } from "../../config/app-config.js";
import { AssessmentsModule } from "../assessments/assessments.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { BillingModule } from "../billing/billing.module.js";
import { CatalogModule } from "../catalog/catalog.module.js";
import { QuestionsModule } from "../questions/questions.module.js";
import { SettingsModule } from "../settings/settings.module.js";
import { AI_PROVIDER } from "./ai.contract.js";
import { AiAssistantService } from "./application/ai-assistant.service.js";
import { AiRunner } from "./application/ai-runner.service.js";
import { KnowledgeService } from "./application/knowledge.service.js";
import { StudentTutorService } from "./application/student-tutor.service.js";
import { StudyChatService } from "./application/study-chat.service.js";
import { AI_RUN_STORE, CHAT_STORE, KNOWLEDGE_STORE } from "./domain/ports.js";
import { AnthropicAiProvider } from "./infrastructure/anthropic-provider.js";
import { DrizzleAiRunStore } from "./infrastructure/drizzle-ai-run-store.js";
import { DrizzleChatStore } from "./infrastructure/drizzle-chat-store.js";
import { DrizzleKnowledgeStore } from "./infrastructure/drizzle-knowledge-store.js";
import { OpenAiCompatibleProvider } from "./infrastructure/openai-compatible-provider.js";
import { AdminAiController } from "./presentation/admin-ai.controller.js";
import { AdminKnowledgeController } from "./presentation/admin-knowledge.controller.js";
import { StudentAiController } from "./presentation/student-ai.controller.js";

/**
 * AI (AGENTS.md §5 "ai", AI_INTEGRATION.md): advisory AI for question authors,
 * the knowledge library its retrieval reads (RAG), and, for subscribers,
 * explanations of a student's own mistakes and the study chat, through
 * @qup/ai-gateway. Owns ai_runs, the library and the chats; reads questions,
 * the catalog, assessments, billing access, settings and account names only
 * through their contracts. Never decides mastery, publishes or grades.
 */
@Module({
  imports: [
    QuestionsModule,
    CatalogModule,
    AuthModule,
    AssessmentsModule,
    BillingModule,
    SettingsModule,
  ],
  controllers: [AdminAiController, AdminKnowledgeController, StudentAiController],
  providers: [
    AiRunner,
    AiAssistantService,
    KnowledgeService,
    StudentTutorService,
    StudyChatService,
    { provide: AI_RUN_STORE, useClass: DrizzleAiRunStore },
    { provide: KNOWLEDGE_STORE, useClass: DrizzleKnowledgeStore },
    { provide: CHAT_STORE, useClass: DrizzleChatStore },
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
