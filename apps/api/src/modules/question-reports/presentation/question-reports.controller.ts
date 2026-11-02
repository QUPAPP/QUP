import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { actorFrom } from "../../../common/http/actor-context.js";
import { uuidParam } from "../../../common/validation/schemas.js";
import { ZodValidationPipe } from "../../../common/validation/zod-validation.pipe.js";
import type { Principal } from "../../auth/domain/principal.js";
import { CurrentPrincipal } from "../../auth/presentation/current-principal.decorator.js";
import { Permission } from "../../rbac/permissions.js";
import { RequirePermissions } from "../../rbac/require-permissions.js";
import { QuestionReportsService } from "../application/question-reports.service.js";
import { REPORT_NOTE_MAX, REPORT_REASONS, REPORT_STATUSES } from "../domain/question-report.js";

const PAGE_MAX = 100;
const DEFAULT_PAGE = 30;

const optionalNote = z
  .string()
  .trim()
  .max(REPORT_NOTE_MAX)
  .optional()
  .transform((note) => (note ? note : null));

const reportBody = z.strictObject({ reason: z.enum(REPORT_REASONS), note: optionalNote });
type ReportBody = z.output<typeof reportBody>;

const listQuery = z.strictObject({
  status: z.enum(REPORT_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(PAGE_MAX).default(DEFAULT_PAGE),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});
type ListQuery = z.output<typeof listQuery>;

const closeBody = z.strictObject({
  status: z.enum(["RESOLVED", "DISMISSED"]),
  note: optionalNote,
});
type CloseBody = z.output<typeof closeBody>;

const uuid = new ZodValidationPipe(uuidParam);

@ApiTags("question reports")
@Controller()
export class StudentQuestionReportsController {
  constructor(private readonly reports: QuestionReportsService) {}

  @Post("assessments/:sessionId/items/:itemId/reports")
  @ApiOperation({
    summary: "Report a problem in a question the student was shown (201 new, 200 already open).",
  })
  async report(
    @CurrentPrincipal() principal: Principal,
    @Param("sessionId", uuid) sessionId: string,
    @Param("itemId", uuid) itemId: string,
    @Body(new ZodValidationPipe(reportBody)) body: ReportBody,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { report, created } = await this.reports.report(
      principal.userId,
      { sessionId, itemId },
      body,
    );
    reply.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    // Students see that their report was received, not the review notes.
    return { id: report.id, reason: report.reason, status: report.status };
  }
}

@ApiTags("admin: question reports")
@RequirePermissions(Permission.QuestionsReview)
@Controller("admin/question-reports")
export class AdminQuestionReportsController {
  constructor(private readonly reports: QuestionReportsService) {}

  @Get()
  @ApiOperation({ summary: "Question reports, newest first, with the number still open." })
  async list(@Query(new ZodValidationPipe(listQuery)) query: ListQuery) {
    const { items, hasMore, openCount } = await this.reports.list({
      status: query.status ?? null,
      limit: query.limit,
      offset: query.offset,
    });
    return {
      items,
      openCount,
      page: { limit: query.limit, offset: query.offset, hasMore },
    };
  }

  @Post(":id/close")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Resolve (fixed) or dismiss (not a problem) an open report." })
  async close(
    @Param("id", uuid) id: string,
    @Body(new ZodValidationPipe(closeBody)) body: CloseBody,
    @Req() request: FastifyRequest,
  ) {
    return this.reports.close(id, body, actorFrom(request));
  }
}
