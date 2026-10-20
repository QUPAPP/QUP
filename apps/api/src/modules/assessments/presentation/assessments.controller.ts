import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { FastifyReply } from "fastify";

import { requireIdempotencyKey } from "../../../common/http/idempotency-key.js";
import { uuidParam } from "../../../common/validation/schemas.js";
import { ZodValidationPipe } from "../../../common/validation/zod-validation.pipe.js";
import type { Principal } from "../../auth/domain/principal.js";
import { CurrentPrincipal } from "../../auth/presentation/current-principal.decorator.js";
import { AssessmentsService, type SubmitResult } from "../application/assessments.service.js";
import type { Session, SessionProgress } from "../domain/ports.js";
import {
  type AnswerBody,
  answerBody,
  type SessionHistoryQuery,
  type SkipBody,
  sessionHistoryQuery,
  skipBody,
} from "./assessments.dto.js";
import { toPreliminaryResultView } from "./assessments.views.js";

const uuid = new ZodValidationPipe(uuidParam);

function toSessionView(session: Session, progress?: SessionProgress) {
  return {
    id: session.id,
    examId: session.examId,
    type: session.type,
    status: session.status,
    startedAt: session.startedAt?.toISOString() ?? null,
    completedAt: session.completedAt?.toISOString() ?? null,
    ...(progress ? { progress: { answered: progress.finalized, total: progress.total } } : {}),
  };
}

/** API_CONTRACTS.md "Submit Answer — safe response". Never includes an answer key. */
function toSubmitView(result: SubmitResult) {
  return {
    attemptId: result.attemptId,
    result: { isCorrect: result.isCorrect },
    progress: { answered: result.progress.finalized, total: result.progress.total },
    next: { type: result.completed ? "COMPLETED" : "QUESTION" },
  };
}

/**
 * Student assessment routes (API_CONTRACTS.md "Assessments"). Signed-in users
 * only; identity always comes from the session cookie, never from the request.
 */
@ApiTags("assessments")
@Controller()
export class AssessmentsController {
  constructor(private readonly assessments: AssessmentsService) {}

  @Get("assessments")
  @ApiOperation({ summary: "The caller's session history and progress, newest first. Paginated." })
  async history(
    @CurrentPrincipal() principal: Principal,
    @Query(new ZodValidationPipe(sessionHistoryQuery)) query: SessionHistoryQuery,
  ) {
    const { items, hasMore } = await this.assessments.history(principal.userId, query);
    return {
      items: items.map(({ session, progress, examName }) => ({
        ...toSessionView(session, progress),
        exam: { id: session.examId, nameAr: examName },
        createdAt: session.createdAt.toISOString(),
      })),
      page: { limit: query.limit, offset: query.offset, hasMore },
    };
  }

  @Post("exams/:examId/assessments/mini-diagnostic")
  @ApiOperation({
    summary: "Start the free mini diagnostic, or resume the open one (201 new, 200 resumed).",
  })
  async startMiniDiagnostic(
    @CurrentPrincipal() principal: Principal,
    @Param("examId", uuid) examId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { session, created } = await this.assessments.startMiniDiagnostic(
      principal.userId,
      examId,
    );
    reply.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return { ...toSessionView(session), resumed: !created };
  }

  @Post("exams/:examId/assessments/full-diagnostic")
  @ApiOperation({
    summary: "Start the paid full diagnostic, or resume the open one (201 new, 200 resumed).",
  })
  async startFullDiagnostic(
    @CurrentPrincipal() principal: Principal,
    @Param("examId", uuid) examId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { session, created } = await this.assessments.startFullDiagnostic(
      principal.userId,
      examId,
    );
    reply.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return { ...toSessionView(session), resumed: !created };
  }

  @Get("assessments/:sessionId")
  async get(@CurrentPrincipal() principal: Principal, @Param("sessionId", uuid) sessionId: string) {
    const { session, progress } = await this.assessments.get(principal.userId, sessionId);
    return toSessionView(session, progress);
  }

  @Post("assessments/:sessionId/start")
  @HttpCode(HttpStatus.OK)
  async start(
    @CurrentPrincipal() principal: Principal,
    @Param("sessionId", uuid) sessionId: string,
  ) {
    return toSessionView(await this.assessments.start(principal.userId, sessionId));
  }

  @Get("assessments/:sessionId/current-item")
  @ApiOperation({
    summary: "The next unanswered item, without its answer key. `item` is null when done.",
  })
  async currentItem(
    @CurrentPrincipal() principal: Principal,
    @Param("sessionId", uuid) sessionId: string,
  ) {
    const { item, progress } = await this.assessments.currentItem(principal.userId, sessionId);
    return { item, progress: { answered: progress.finalized, total: progress.total } };
  }

  @Post("assessments/:sessionId/items/:itemId/answer")
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: "Idempotency-Key", required: true, description: "UUID; retries reuse it." })
  @ApiOperation({
    summary: "Submit an answer. Graded on the server; safe to retry with the same key.",
  })
  async answer(
    @CurrentPrincipal() principal: Principal,
    @Param("sessionId", uuid) sessionId: string,
    @Param("itemId", uuid) itemId: string,
    @Headers("idempotency-key") rawKey: string | undefined,
    @Body(new ZodValidationPipe(answerBody)) body: AnswerBody,
  ) {
    const key = requireIdempotencyKey(rawKey);
    const chosenKeys =
      "optionKey" in body.answer ? [body.answer.optionKey] : body.answer.optionKeys;
    const result = await this.assessments.submit(principal.userId, sessionId, itemId, key, {
      kind: "ANSWER",
      chosenKeys,
      responseTimeMs: body.clientTiming?.responseTimeMs ?? null,
    });
    return toSubmitView(result);
  }

  @Post("assessments/:sessionId/items/:itemId/skip")
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiOperation({
    summary: "Skip an item. Recorded, but yields no mastery evidence (ADAPTIVE_ENGINE.md §10).",
  })
  async skip(
    @CurrentPrincipal() principal: Principal,
    @Param("sessionId", uuid) sessionId: string,
    @Param("itemId", uuid) itemId: string,
    @Headers("idempotency-key") rawKey: string | undefined,
    @Body(new ZodValidationPipe(skipBody)) body: SkipBody,
  ) {
    const key = requireIdempotencyKey(rawKey);
    const result = await this.assessments.submit(principal.userId, sessionId, itemId, key, {
      kind: "SKIP",
      responseTimeMs: body?.clientTiming?.responseTimeMs ?? null,
    });
    return toSubmitView(result);
  }

  @Post("assessments/:sessionId/complete")
  @HttpCode(HttpStatus.OK)
  async complete(
    @CurrentPrincipal() principal: Principal,
    @Param("sessionId", uuid) sessionId: string,
  ) {
    return toSessionView(await this.assessments.complete(principal.userId, sessionId));
  }

  @Get("assessments/:sessionId/result")
  @ApiOperation({
    summary:
      "Preliminary result of a completed mini diagnostic: score, diagnostic level, up to 2 strengths and 3 weaknesses.",
  })
  async result(
    @CurrentPrincipal() principal: Principal,
    @Param("sessionId", uuid) sessionId: string,
  ) {
    return toPreliminaryResultView(await this.assessments.result(principal.userId, sessionId));
  }
}
