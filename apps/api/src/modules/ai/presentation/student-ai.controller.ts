import { Controller, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { uuidParam } from "../../../common/validation/schemas.js";
import { ZodValidationPipe } from "../../../common/validation/zod-validation.pipe.js";
import { AiEndpoint } from "../../../infrastructure/rate-limit/rate-limit.module.js";
import type { Principal } from "../../auth/domain/principal.js";
import { CurrentPrincipal } from "../../auth/presentation/current-principal.decorator.js";
import { StudentTutorService } from "../application/student-tutor.service.js";

const uuid = new ZodValidationPipe(uuidParam);

/**
 * AI for students (AI_INTEGRATION.md "Student Explanation"): a personalised
 * explanation of the student's own wrong training answer. Off by default
 * (AI_STUDENT_EXPLANATIONS, OPEN_QUESTIONS.md #18).
 */
@ApiTags("ai")
@Controller()
export class StudentAiController {
  constructor(private readonly tutor: StudentTutorService) {}

  @Get("me/ai-features")
  @ApiOperation({ summary: "Which AI features students can use on this deployment." })
  features() {
    return { mistakeExplanations: this.tutor.enabled() };
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
}
