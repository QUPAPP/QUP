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
import { ImportsService } from "../application/imports.service.js";
import type { SuggestedMapping } from "../domain/column-suggestions.js";
import { ImportFileTooLarge } from "../domain/import.errors.js";
import { IMPORT_LIMITS, MAX_UPLOAD_BASE64_CHARS } from "../domain/import-limits.js";
import type { ImportBatch, ImportItem } from "../domain/ports.js";

const FILENAME_MAX = 255;
const COLUMN_MAX = 200;
const PAGE_MAX = 200;
const DEFAULT_PAGE = 50;
const MAX_OPTIONS = 6;
const ITEM_STATUSES = ["PENDING", "VALID", "INVALID", "DUPLICATE", "IMPORTED", "SKIPPED"] as const;

const column = z.string().min(1).max(COLUMN_MAX);

const uploadBody = z.strictObject({
  filename: z.string().trim().min(1).max(FILENAME_MAX),
  contentBase64: z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/, "must be base64"),
});
type UploadBody = z.output<typeof uploadBody>;

const processBody = z.strictObject({
  taxonomyVersionId: z.uuid(),
  mapping: z.strictObject({
    stem: column,
    options: z.array(column).min(2).max(MAX_OPTIONS),
    correctAnswer: column,
    skill: column,
    subskill: column.optional(),
    questionType: column.optional(),
    explanation: column.optional(),
    difficulty: column.optional(),
    source: column.optional(),
  }),
});
type ProcessBody = z.output<typeof processBody>;

const resolveBody = z.strictObject({ action: z.enum(["SKIP", "INCLUDE"]) });
type ResolveBody = z.output<typeof resolveBody>;

const page = {
  limit: z.coerce.number().int().min(1).max(PAGE_MAX).default(DEFAULT_PAGE),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
};
const listQuery = z.strictObject(page);
const itemsQuery = z.strictObject({ ...page, status: z.enum(ITEM_STATUSES).optional() });

const uuid = new ZodValidationPipe(uuidParam);

function toBatchView(batch: ImportBatch, suggestedMapping?: SuggestedMapping) {
  return {
    id: batch.id,
    originalFilename: batch.originalFilename,
    detectedType: batch.detectedType,
    status: batch.status,
    headers: batch.headers,
    mapping: batch.mapping,
    taxonomyVersionId: batch.taxonomyVersionId,
    totals: batch.totals,
    createdAt: batch.createdAt.toISOString(),
    completedAt: batch.completedAt?.toISOString() ?? null,
    ...(suggestedMapping ? { suggestedMapping } : {}),
  };
}

function toItemView(item: ImportItem) {
  return {
    id: item.id,
    sourceLocator: item.sourceLocator,
    status: item.status,
    errors: item.errors,
    duplicateOfQuestionId: item.duplicateOfQuestionId,
    resultingQuestionVersionId: item.resultingQuestionVersionId,
    cells: item.payload.raw,
    question: item.payload.row ?? null,
  };
}

/**
 * Structured question import (API_CONTRACTS.md "Imports"). Whoever writes
 * questions may import them (questions.create): imports only ever make drafts.
 */
@ApiTags("admin: imports")
@RequirePermissions(Permission.QuestionsCreate)
@Controller("admin")
export class AdminImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Get("imports")
  @ApiOperation({ summary: "Import batches, newest first." })
  async list(@Query(new ZodValidationPipe(listQuery)) query: z.output<typeof listQuery>) {
    const { items, hasMore } = await this.imports.list(query);
    return { items: items.map((batch) => toBatchView(batch)), page: { ...query, hasMore } };
  }

  @Post("imports/upload")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Upload a CSV, TSV, JSON or XLSX file as base64 (at most 2 MiB)." })
  async upload(
    @Body(new ZodValidationPipe(uploadBody)) body: UploadBody,
    @Req() request: FastifyRequest,
  ) {
    if (body.contentBase64.length > MAX_UPLOAD_BASE64_CHARS) {
      throw new ImportFileTooLarge(IMPORT_LIMITS.maxFileBytes);
    }
    const { batch, suggestedMapping } = await this.imports.upload(
      { filename: body.filename, bytes: new Uint8Array(Buffer.from(body.contentBase64, "base64")) },
      actorFrom(request),
    );
    return toBatchView(batch, suggestedMapping);
  }

  @Get("imports/:id")
  @ApiOperation({ summary: "A batch: columns, suggested and current mapping, report." })
  async get(@Param("id", uuid) id: string) {
    const { batch, suggestedMapping } = await this.imports.get(id);
    return toBatchView(batch, suggestedMapping);
  }

  @Get("imports/:id/items")
  @ApiOperation({ summary: "A batch's rows in file order, optionally of one status." })
  async items(
    @Param("id", uuid) id: string,
    @Query(new ZodValidationPipe(itemsQuery)) query: z.output<typeof itemsQuery>,
  ) {
    const { items, hasMore } = await this.imports.items(id, query);
    return {
      items: items.map(toItemView),
      page: { limit: query.limit, offset: query.offset, hasMore },
    };
  }

  @Post("imports/:id/process")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Map the columns and validate every row; find duplicates." })
  async process(
    @Param("id", uuid) id: string,
    @Body(new ZodValidationPipe(processBody)) body: ProcessBody,
  ) {
    return toBatchView(await this.imports.process(id, body));
  }

  @Post("import-items/:id/resolve")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Skip a row, include a confirmed duplicate, or undo a skip." })
  async resolve(
    @Param("id", uuid) id: string,
    @Body(new ZodValidationPipe(resolveBody)) body: ResolveBody,
  ) {
    return toItemView(await this.imports.resolve(id, body.action));
  }

  @Post("imports/:id/create-drafts")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Turn every valid row into a DRAFT question with provenance." })
  async createDrafts(@Param("id", uuid) id: string, @Req() request: FastifyRequest) {
    return toBatchView(await this.imports.createDrafts(id, actorFrom(request)));
  }
}
