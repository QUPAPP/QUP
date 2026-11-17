import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";

import { uuidParam } from "../../../common/validation/schemas.js";
import { ZodValidationPipe } from "../../../common/validation/zod-validation.pipe.js";
import { AiEndpoint } from "../../../infrastructure/rate-limit/rate-limit.module.js";
import type { Principal } from "../../auth/domain/principal.js";
import { CurrentPrincipal } from "../../auth/presentation/current-principal.decorator.js";
import { StudentTutorService } from "../application/student-tutor.service.js";
import { CHAT_MESSAGE_MAX_CHARS, StudyChatService } from "../application/study-chat.service.js";

const uuid = new ZodValidationPipe(uuidParam);

const featuresQuery = z.strictObject({ examId: z.uuid().optional() });
type FeaturesQuery = z.output<typeof featuresQuery>;

const chatBody = z.strictObject({
  message: z.string().trim().min(1).max(CHAT_MESSAGE_MAX_CHARS),
});
type ChatBody = z.output<typeof chatBody>;

const messageView = (message: { id: string; role: string; content: string; createdAt: Date }) => ({
  ...message,
  createdAt: message.createdAt.toISOString(),
});

/**
 * AI for students (AI_INTEGRATION.md "Student Explanation", "Study Chat"):
 * explanations of the student's own wrong answers and the study chat, both
 * for subscribers of the exam only (OPEN_QUESTIONS.md #18).
 */
@ApiTags("ai")
@Controller()
export class StudentAiController {
  constructor(
    private readonly tutor: StudentTutorService,
    private readonly chat: StudyChatService,
  ) {}

  @Get("me/ai-features")
  @ApiOperation({
    summary:
      "Which AI features this deployment offers, and with examId whether the student's subscription covers them.",
  })
  async features(
    @CurrentPrincipal() principal: Principal,
    @Query(new ZodValidationPipe(featuresQuery)) query: FeaturesQuery,
  ) {
    const allowance = query.examId
      ? await this.chat.allowance(principal.userId, query.examId)
      : { subscribed: null, freeRemaining: null };
    return {
      mistakeExplanations: this.tutor.enabled(),
      studyChat: this.chat.enabled(),
      subscribed: allowance.subscribed,
      freeChatMessagesLeft: allowance.freeRemaining,
    };
  }

  @Post("exams/:examId/mistakes/:questionVersionId/ai-explanation")
  @HttpCode(HttpStatus.OK)
  @AiEndpoint()
  @ApiOperation({
    summary:
      "Explain the student's latest wrong training answer on a question, and the likely error.",
  })
  async explainMistake(
    @CurrentPrincipal() principal: Principal,
    @Param("examId", uuid) examId: string,
    @Param("questionVersionId", uuid) questionVersionId: string,
  ) {
    return {
      explanation: await this.tutor.explainMistake(principal.userId, examId, questionVersionId),
    };
  }

  @Get("exams/:examId/ai-chat")
  @ApiOperation({ summary: "The student's study chat for an exam, oldest message first." })
  async chatHistory(
    @CurrentPrincipal() principal: Principal,
    @Param("examId", uuid) examId: string,
  ) {
    const messages = await this.chat.history(principal.userId, examId);
    return { items: messages.map(messageView) };
  }

  @Post("exams/:examId/ai-chat")
  @HttpCode(HttpStatus.OK)
  @AiEndpoint()
  @ApiOperation({ summary: "Send a message to the study chat and get its reply." })
  async sendChat(
    @CurrentPrincipal() principal: Principal,
    @Param("examId", uuid) examId: string,
    @Body(new ZodValidationPipe(chatBody)) body: ChatBody,
  ) {
    const reply = await this.chat.send(principal.userId, examId, body.message);
    return { ...reply, messages: reply.messages.map(messageView) };
  }

  @Delete("exams/:examId/ai-chat")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Clear the student's study chat for an exam." })
  async clearChat(@CurrentPrincipal() principal: Principal, @Param("examId", uuid) examId: string) {
    await this.chat.clear(principal.userId, examId);
  }
}
