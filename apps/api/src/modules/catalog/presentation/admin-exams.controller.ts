import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { FastifyRequest } from "fastify";

import { actorFrom } from "../../../common/http/actor-context.js";
import { uuidParam } from "../../../common/validation/schemas.js";
import { ZodValidationPipe } from "../../../common/validation/zod-validation.pipe.js";
import { Permission } from "../../rbac/permissions.js";
import { RequirePermissions } from "../../rbac/require-permissions.js";
import { ExamsService } from "../application/exams.service.js";
import { TaxonomyService } from "../application/taxonomy.service.js";
import {
  type CreateExamBody,
  type CreateTaxonomyVersionBody,
  createExamBody,
  createTaxonomyVersionBody,
  type UpdateExamBody,
  updateExamBody,
} from "./catalog.dto.js";
import {
  type ExamView,
  type TaxonomyVersionView,
  toExamView,
  toVersionView,
} from "./catalog.views.js";

/** API_CONTRACTS.md "Exams — Admin". Class-level permission: every route here is covered. */
@ApiTags("admin: exams")
@RequirePermissions(Permission.TaxonomyManage)
@Controller("admin/exams")
export class AdminExamsController {
  constructor(
    private readonly exams: ExamsService,
    private readonly taxonomy: TaxonomyService,
  ) {}

  @Get()
  @ApiOperation({ summary: "All exams, in every status." })
  async list(): Promise<{ items: ExamView[] }> {
    // Exams number in the single digits (PRD §4); pagination adds nothing yet.
    return { items: (await this.exams.listAll()).map(toExamView) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create an exam. It starts as DRAFT, invisible to students." })
  async create(
    @Body(new ZodValidationPipe(createExamBody)) body: CreateExamBody,
  ): Promise<ExamView> {
    const exam = await this.exams.create({
      code: body.code,
      slug: body.slug,
      nameAr: body.nameAr,
      nameEn: body.nameEn ?? null,
      description: body.description ?? null,
    });
    return toExamView(exam);
  }

  @Patch(":id")
  @ApiOperation({
    summary: "Edit an exam or move it forward: DRAFT → ACTIVE → ARCHIVED.",
    description: "Activation requires a published taxonomy version.",
  })
  async update(
    @Param("id", new ZodValidationPipe(uuidParam)) id: string,
    @Body(new ZodValidationPipe(updateExamBody)) body: UpdateExamBody,
  ): Promise<ExamView> {
    return toExamView(await this.exams.update(id, body));
  }

  @Get(":id/taxonomy-versions")
  @ApiOperation({ summary: "The exam's taxonomy versions, newest first, in every status." })
  async listTaxonomyVersions(
    @Param("id", new ZodValidationPipe(uuidParam)) examId: string,
  ): Promise<{ items: TaxonomyVersionView[] }> {
    // An exam has a handful of versions over its life; pagination adds nothing.
    return { items: (await this.taxonomy.listVersions(examId)).map(toVersionView) };
  }

  @Post(":id/taxonomy-versions")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Start a new DRAFT taxonomy version for the exam." })
  async createTaxonomyVersion(
    @Param("id", new ZodValidationPipe(uuidParam)) examId: string,
    @Body(new ZodValidationPipe(createTaxonomyVersionBody)) body: CreateTaxonomyVersionBody,
    @Req() request: FastifyRequest,
  ): Promise<TaxonomyVersionView> {
    const version = await this.taxonomy.createVersion(
      examId,
      {
        versionCode: body.versionCode,
        effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : null,
      },
      actorFrom(request),
    );
    return toVersionView(version);
  }
}
