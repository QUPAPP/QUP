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
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { FastifyRequest } from "fastify";
import { z } from "zod";

import { actorFrom } from "../../../common/http/actor-context.js";
import { uuidParam } from "../../../common/validation/schemas.js";
import { ZodValidationPipe } from "../../../common/validation/zod-validation.pipe.js";
import { Permission } from "../../rbac/permissions.js";
import { RequirePermissions } from "../../rbac/require-permissions.js";
import { KnowledgeService } from "../application/knowledge.service.js";
import {
  KNOWLEDGE_CONTENT_MAX,
  KNOWLEDGE_KINDS,
  KNOWLEDGE_TITLE_MAX,
} from "../domain/knowledge.js";
import type { KnowledgeItemView } from "../domain/ports.js";

const PAGE_MAX = 100;
const DEFAULT_PAGE = 30;

const listQuery = z.strictObject({
  examId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(PAGE_MAX).default(DEFAULT_PAGE),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});
type ListQuery = z.output<typeof listQuery>;

const addBody = z.strictObject({
  taxonomyVersionId: z.uuid(),
  nodeId: z.uuid().nullable().default(null),
  kind: z.enum(KNOWLEDGE_KINDS),
  title: z.string().trim().min(1).max(KNOWLEDGE_TITLE_MAX),
  content: z.string().trim().min(1).max(KNOWLEDGE_CONTENT_MAX),
});
type AddBody = z.output<typeof addBody>;

const uuid = new ZodValidationPipe(uuidParam);

const view = (item: KnowledgeItemView) => ({ ...item, createdAt: item.createdAt.toISOString() });

/**
 * The knowledge library (AI_INTEGRATION.md "Knowledge Library"): model
 * questions question generation imitates, and references the study chat is
 * grounded on. Admins of AI only (ai.manage); every change is audited.
 */
@ApiTags("admin: ai")
@RequirePermissions(Permission.AiManage)
@Controller("admin/ai/knowledge")
export class AdminKnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Get()
  @ApiOperation({ summary: "Live library entries, newest first; of one exam with examId." })
  async list(@Query(new ZodValidationPipe(listQuery)) query: ListQuery) {
    const { items, hasMore } = await this.knowledge.list({
      examId: query.examId ?? null,
      limit: query.limit,
      offset: query.offset,
    });
    return {
      items: items.map(view),
      page: { limit: query.limit, offset: query.offset, hasMore },
    };
  }

  @Post()
  @ApiOperation({
    summary: "Add a model question set or a reference text to an exam's library.",
  })
  async add(@Body(new ZodValidationPipe(addBody)) body: AddBody, @Req() request: FastifyRequest) {
    return { item: view(await this.knowledge.add(body, actorFrom(request))) };
  }

  @Post(":id/archive")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Archive an entry: it is no longer retrieved." })
  async archive(@Param("id", uuid) id: string, @Req() request: FastifyRequest) {
    await this.knowledge.archive(id, actorFrom(request));
  }
}
