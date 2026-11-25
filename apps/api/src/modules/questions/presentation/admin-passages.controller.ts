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

import { actorFrom } from "../../../common/http/actor-context.js";
import { uuidParam } from "../../../common/validation/schemas.js";
import { ZodValidationPipe } from "../../../common/validation/zod-validation.pipe.js";
import { Permission } from "../../rbac/permissions.js";
import { RequirePermissions } from "../../rbac/require-permissions.js";
import { PassagesService } from "../application/passages.service.js";
import type { Passage } from "../infrastructure/drizzle-passage-store.js";
import {
  type CreatePassageBody,
  createPassageBody,
  type ListPassagesQuery,
  listPassagesQuery,
} from "./questions.dto.js";

const uuid = new ZodValidationPipe(uuidParam);

const toView = (passage: Passage) => ({
  id: passage.id,
  title: passage.title,
  content: passage.content,
  createdAt: passage.createdAt.toISOString(),
});

/** Reading passages for question authors (API_CONTRACTS.md "Reading passages"). Create-only. */
@ApiTags("admin: questions")
@RequirePermissions(Permission.QuestionsCreate)
@Controller("admin/passages")
export class AdminPassagesController {
  constructor(private readonly passages: PassagesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Write a reading passage several questions share. It never changes afterwards.",
  })
  async create(
    @Body(new ZodValidationPipe(createPassageBody)) body: CreatePassageBody,
    @Req() request: FastifyRequest,
  ) {
    return toView(await this.passages.create(body, actorFrom(request)));
  }

  @Get()
  @ApiOperation({ summary: "Passages, newest first, with how many question versions use each." })
  async list(@Query(new ZodValidationPipe(listPassagesQuery)) query: ListPassagesQuery) {
    const { items, hasMore } = await this.passages.list(query);
    return {
      items: items.map((item) => ({ ...toView(item), questionCount: item.questionCount })),
      page: { limit: query.limit, offset: query.offset, hasMore },
    };
  }

  @Get(":id")
  @ApiOperation({ summary: "One passage." })
  async get(@Param("id", uuid) id: string) {
    return toView(await this.passages.get(id));
  }
}
