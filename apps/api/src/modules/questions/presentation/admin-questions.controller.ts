import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { FastifyRequest } from "fastify";

import { actorFrom } from "../../../common/http/actor-context.js";
import { uuidParam } from "../../../common/validation/schemas.js";
import { ZodValidationPipe } from "../../../common/validation/zod-validation.pipe.js";
import { Permission } from "../../rbac/permissions.js";
import { RequirePermissions } from "../../rbac/require-permissions.js";
import { QuestionsService } from "../application/questions.service.js";
import {
  type CreateQuestionBody,
  createQuestionBody,
  type DraftContentBody,
  draftContentBody,
  type ListQuestionsQuery,
  listQuestionsQuery,
  type ReviewBody,
  reviewBody,
  toDraftContent,
} from "./questions.dto.js";
import { toQuestionListItemView, toQuestionView, toVersionDetailView } from "./questions.views.js";

/**
 * API_CONTRACTS.md "Questions". Permissions (OPEN_QUESTIONS.md #14, decided):
 *   questions.create  — read, author, submit for review   (CONTENT_MANAGER, ADMIN)
 *   questions.review  — approve / send back                (CONTENT_MANAGER, ADMIN)
 *   questions.publish — publish, archive                   (ADMIN only)
 *
 * The class-level permission is a floor: a route added later without its own
 * decorator is still closed to students. Method-level decorators override it
 * (the guard reads the handler first).
 */
@ApiTags("admin: questions")
@RequirePermissions(Permission.QuestionsCreate)
@Controller("admin")
export class AdminQuestionsController {
  constructor(private readonly questions: QuestionsService) {}

  @Get("questions")
  @RequirePermissions(Permission.QuestionsCreate)
  @ApiOperation({ summary: "Questions, each described by its newest version. Paginated." })
  async list(@Query(new ZodValidationPipe(listQuestionsQuery)) query: ListQuestionsQuery) {
    const { items, total } = await this.questions.list(query);
    return {
      items: items.map(toQuestionListItemView),
      page: { limit: query.limit, offset: query.offset, total },
    };
  }

  @Post("questions")
  @RequirePermissions(Permission.QuestionsCreate)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create a question and its first DRAFT version." })
  async create(
    @Body(new ZodValidationPipe(createQuestionBody)) body: CreateQuestionBody,
    @Req() request: FastifyRequest,
  ) {
    const version = await this.questions.create(
      { stableCode: body.stableCode, content: toDraftContent(body.content) },
      actorFrom(request),
    );
    return toVersionDetailView(version);
  }

  @Get("questions/:id")
  @RequirePermissions(Permission.QuestionsCreate)
  async get(@Param("id", new ZodValidationPipe(uuidParam)) questionId: string) {
    return toQuestionView(await this.questions.get(questionId));
  }

  @Post("questions/:id/versions")
  @RequirePermissions(Permission.QuestionsCreate)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Start the next version as a DRAFT copy of the newest one." })
  async createVersion(
    @Param("id", new ZodValidationPipe(uuidParam)) questionId: string,
    @Req() request: FastifyRequest,
  ) {
    return toVersionDetailView(
      await this.questions.createNextVersion(questionId, actorFrom(request)),
    );
  }

  @Post("questions/:id/archive")
  @RequirePermissions(Permission.QuestionsPublish)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Retire a question and all its versions. Audited." })
  async archive(
    @Param("id", new ZodValidationPipe(uuidParam)) questionId: string,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    await this.questions.archive(questionId, actorFrom(request));
  }

  @Get("question-versions/:id")
  @RequirePermissions(Permission.QuestionsCreate)
  @ApiOperation({ summary: "One version with options, answer key, mappings and reviews." })
  async getVersion(@Param("id", new ZodValidationPipe(uuidParam)) versionId: string) {
    return toVersionDetailView(await this.questions.getVersion(versionId));
  }

  @Put("question-versions/:id")
  @RequirePermissions(Permission.QuestionsCreate)
  @ApiOperation({ summary: "Replace the whole content of a DRAFT version." })
  async updateDraft(
    @Param("id", new ZodValidationPipe(uuidParam)) versionId: string,
    @Body(new ZodValidationPipe(draftContentBody)) body: DraftContentBody,
  ) {
    return toVersionDetailView(await this.questions.updateDraft(versionId, toDraftContent(body)));
  }

  @Post("question-versions/:id/submit-review")
  @RequirePermissions(Permission.QuestionsCreate)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "DRAFT → UNDER_REVIEW. Requires a valid answer key and mapping." })
  async submitForReview(
    @Param("id", new ZodValidationPipe(uuidParam)) versionId: string,
  ): Promise<void> {
    await this.questions.submitForReview(versionId);
  }

  @Post("question-versions/:id/reviews")
  @RequirePermissions(Permission.QuestionsReview)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Approve (→ APPROVED) or send back (→ DRAFT). Notes required when sending back.",
  })
  async review(
    @Param("id", new ZodValidationPipe(uuidParam)) versionId: string,
    @Body(new ZodValidationPipe(reviewBody)) body: ReviewBody,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    await this.questions.review(versionId, body.decision, body.notes ?? null, actorFrom(request));
  }

  @Post("question-versions/:id/publish")
  @RequirePermissions(Permission.QuestionsPublish)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "APPROVED → PUBLISHED (ADMIN). The question's previous live version is archived.",
  })
  async publish(
    @Param("id", new ZodValidationPipe(uuidParam)) versionId: string,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    await this.questions.publish(versionId, actorFrom(request));
  }
}
