import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { FastifyRequest } from "fastify";
import { z } from "zod";

import { actorFrom } from "../../../common/http/actor-context.js";
import { uuidParam } from "../../../common/validation/schemas.js";
import { ZodValidationPipe } from "../../../common/validation/zod-validation.pipe.js";
import { AiEndpoint } from "../../../infrastructure/rate-limit/rate-limit.module.js";
import { Permission } from "../../rbac/permissions.js";
import { RequirePermissions } from "../../rbac/require-permissions.js";
import { AiAssistantService } from "../application/ai-assistant.service.js";

const PAGE_MAX = 200;
const DEFAULT_PAGE = 50;

const runsQuery = z.strictObject({
  limit: z.coerce.number().int().min(1).max(PAGE_MAX).default(DEFAULT_PAGE),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});
type RunsQuery = z.output<typeof runsQuery>;

const uuid = new ZodValidationPipe(uuidParam);

/**
 * AI assistance (AI_INTEGRATION.md, C3). Whoever writes questions may ask for
 * advice on a draft (questions.create); the run log is for admins (ai.manage).
 */
@ApiTags("admin: ai")
@RequirePermissions(Permission.QuestionsCreate)
@Controller("admin")
export class AdminAiController {
  constructor(private readonly assistant: AiAssistantService) {}

  @Get("ai/status")
  @ApiOperation({ summary: "Whether AI assistance is on, its provider and its tasks." })
  status() {
    return this.assistant.status();
  }

  @Post("question-versions/:id/ai/metadata-suggestion")
  @HttpCode(HttpStatus.OK)
  @AiEndpoint()
  @ApiOperation({ summary: "Suggest a skill and difficulty for a draft, from its saved content." })
  async suggestMetadata(@Param("id", uuid) versionId: string, @Req() request: FastifyRequest) {
    return { suggestion: await this.assistant.suggestMetadata(versionId, actorFrom(request)) };
  }

  @Post("question-versions/:id/ai/explanation-draft")
  @HttpCode(HttpStatus.OK)
  @AiEndpoint()
  @ApiOperation({ summary: "Draft an explanation of a draft's saved answer key." })
  async draftExplanation(@Param("id", uuid) versionId: string, @Req() request: FastifyRequest) {
    return { draft: await this.assistant.draftExplanation(versionId, actorFrom(request)) };
  }

  @Get("ai/runs")
  @RequirePermissions(Permission.AiManage)
  @ApiOperation({ summary: "Recent AI runs, newest first, with counts by status over 24 hours." })
  async runs(@Query(new ZodValidationPipe(runsQuery)) query: RunsQuery) {
    const { items, hasMore, last24h } = await this.assistant.recentRuns(query);
    return {
      items: items.map((run) => ({ ...run, createdAt: run.createdAt.toISOString() })),
      last24h,
      page: { ...query, hasMore },
    };
  }
}
