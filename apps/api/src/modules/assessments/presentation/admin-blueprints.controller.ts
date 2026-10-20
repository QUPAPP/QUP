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
import { z } from "zod";

import { actorFrom } from "../../../common/http/actor-context.js";
import { decimal, nodeCode, uuidParam } from "../../../common/validation/schemas.js";
import { ZodValidationPipe } from "../../../common/validation/zod-validation.pipe.js";
import { Permission } from "../../rbac/permissions.js";
import { RequirePermissions } from "../../rbac/require-permissions.js";
import { type BlueprintDetail, BlueprintsService } from "../application/blueprints.service.js";
import {
  BLUEPRINT_QUESTION_COUNT,
  type Blueprint,
  DIAGNOSTIC_BLUEPRINT_TYPES,
} from "../domain/blueprint.js";

const NAME_MAX = 120;
/** No exam has anywhere near this many domains; bounds the request, not the product. */
const MAX_DOMAIN_WEIGHTS = 100;

const questionCount = z
  .number()
  .int()
  .min(BLUEPRINT_QUESTION_COUNT.min)
  .max(BLUEPRINT_QUESTION_COUNT.max);
/** numeric(6, 4) like taxonomy weights, but 0 is allowed: it leaves a domain out. */
const domainWeight = decimal({ scale: 4, min: 0, minInclusive: true, max: 99.9999 });

const createBlueprintBody = z.strictObject({
  type: z.enum(DIAGNOSTIC_BLUEPRINT_TYPES),
  code: nodeCode,
  name: z.string().trim().min(1).max(NAME_MAX),
  questionCount,
});
type CreateBlueprintBody = z.output<typeof createBlueprintBody>;

const updateBlueprintBody = z
  .strictObject({
    name: z.string().trim().min(1).max(NAME_MAX).optional(),
    questionCount: questionCount.optional(),
    domainWeights: z
      .array(z.strictObject({ domainId: z.uuid(), weight: domainWeight.nullable() }))
      .max(MAX_DOMAIN_WEIGHTS)
      .refine(
        (entries) => new Set(entries.map((e) => e.domainId)).size === entries.length,
        "each domain at most once",
      )
      .optional(),
  })
  .refine(
    (body) => Object.values(body).some((value) => value !== undefined),
    "provide at least one field to change",
  );
type UpdateBlueprintBody = z.output<typeof updateBlueprintBody>;

const uuid = new ZodValidationPipe(uuidParam);

function toSummary(blueprint: Blueprint) {
  return {
    id: blueprint.id,
    examId: blueprint.examId,
    taxonomyVersionId: blueprint.taxonomyVersionId,
    type: blueprint.type,
    code: blueprint.code,
    name: blueprint.name,
    questionCount: blueprint.questionCount,
    status: blueprint.status,
    createdAt: blueprint.createdAt.toISOString(),
    updatedAt: blueprint.updatedAt.toISOString(),
  };
}

function toView({ blueprint, taxonomyVersion, domains }: BlueprintDetail) {
  const { taxonomyVersionId: _pinned, ...summary } = toSummary(blueprint);
  return {
    ...summary,
    taxonomyVersion: {
      id: taxonomyVersion.id,
      versionCode: taxonomyVersion.versionCode,
      status: taxonomyVersion.status,
    },
    domains,
  };
}

/** API_CONTRACTS.md "Blueprints". ADMIN only (blueprints.manage, migration 0012). */
@ApiTags("admin: blueprints")
@RequirePermissions(Permission.BlueprintsManage)
@Controller("admin")
export class AdminBlueprintsController {
  constructor(private readonly blueprints: BlueprintsService) {}

  @Get("exams/:examId/blueprints")
  @ApiOperation({ summary: "An exam's diagnostic blueprints in every status, newest first." })
  async list(@Param("examId", uuid) examId: string) {
    // A handful per exam over its life; pagination adds nothing yet.
    return { items: (await this.blueprints.list(examId)).map(toSummary) };
  }

  @Post("exams/:examId/blueprints")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create a DRAFT pinned to the exam's published taxonomy version." })
  async create(
    @Param("examId", uuid) examId: string,
    @Body(new ZodValidationPipe(createBlueprintBody)) body: CreateBlueprintBody,
  ) {
    return toView(await this.blueprints.create(examId, body));
  }

  @Get("blueprints/:id")
  @ApiOperation({ summary: "A blueprint with its domains and weights." })
  async get(@Param("id", uuid) id: string) {
    return toView(await this.blueprints.get(id));
  }

  @Patch("blueprints/:id")
  @ApiOperation({ summary: "Change a DRAFT: name, question count, domain weights." })
  async update(
    @Param("id", uuid) id: string,
    @Body(new ZodValidationPipe(updateBlueprintBody)) body: UpdateBlueprintBody,
  ) {
    return toView(
      await this.blueprints.update(id, {
        name: body.name,
        questionCount: body.questionCount,
        domainWeights: body.domainWeights
          ? new Map(body.domainWeights.map((entry) => [entry.domainId, entry.weight]))
          : undefined,
      }),
    );
  }

  @Post("blueprints/:id/activate")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "DRAFT → ACTIVE; the exam's previous active one is archived." })
  async activate(@Param("id", uuid) id: string, @Req() request: FastifyRequest) {
    return toView(await this.blueprints.activate(id, actorFrom(request)));
  }

  @Post("blueprints/:id/archive")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Retire a blueprint. Sessions keep pointing at it." })
  async archive(@Param("id", uuid) id: string, @Req() request: FastifyRequest) {
    return toView(await this.blueprints.archive(id, actorFrom(request)));
  }
}
