import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, Res } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { actorFrom } from "../../../common/http/actor-context.js";
import { uuidParam } from "../../../common/validation/schemas.js";
import { ZodValidationPipe } from "../../../common/validation/zod-validation.pipe.js";
import { Permission } from "../../rbac/permissions.js";
import { RequirePermissions } from "../../rbac/require-permissions.js";
import { QuestionAssetsService } from "../application/question-assets.service.js";
import { MAX_ASSET_BASE64_CHARS, parseByteRange } from "../domain/question-assets.js";

const uploadBody = z.strictObject({
  /** The file, base64-encoded (JSON only, like the import upload). */
  contentBase64: z
    .string()
    .min(1)
    .max(MAX_ASSET_BASE64_CHARS)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, "must be base64"),
});
type UploadBody = z.output<typeof uploadBody>;

const uuid = new ZodValidationPipe(uuidParam);

/** An asset never changes once uploaded: a browser may keep it, but only for this person. */
const ASSET_CACHE_CONTROL = "private, max-age=31536000, immutable";
/**
 * Even if a browser were tricked into rendering the bytes as a page, nothing
 * would run: no scripts, no requests, a sandboxed origin.
 */
const ASSET_CSP = "default-src 'none'; sandbox";

/** Uploading images and audio for question content (authors), API_CONTRACTS.md "Question assets". */
@ApiTags("admin: questions")
@RequirePermissions(Permission.QuestionsCreate)
@Controller("admin/question-assets")
export class AdminQuestionAssetsController {
  constructor(private readonly assets: QuestionAssetsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Upload an image (PNG, JPEG, WebP ≤ 2 MiB) or audio (MP3, M4A ≤ 8 MiB) for questions.",
    description:
      "The type is read from the bytes. The same file uploaded again returns the same asset (200). 400 ASSET_TYPE_NOT_ACCEPTED / ASSET_TOO_LARGE.",
  })
  async upload(
    @Body(new ZodValidationPipe(uploadBody)) body: UploadBody,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const bytes = new Uint8Array(Buffer.from(body.contentBase64, "base64"));
    const { asset, created } = await this.assets.upload(bytes, actorFrom(request));
    reply.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return {
      id: asset.id,
      kind: asset.kind,
      contentType: asset.contentType,
      byteSize: asset.byteSize,
    };
  }
}

/**
 * Serving an asset to anyone signed in. An asset is reachable only by its
 * random id, which a student sees only inside content delivered to them —
 * an explanation's image after they answered, like the explanation itself.
 */
@ApiTags("questions")
@Controller("question-assets")
export class QuestionAssetsController {
  constructor(private readonly assets: QuestionAssetsService) {}

  @Get(":id")
  @ApiOperation({ summary: "An image or audio file of question content. Supports byte ranges." })
  async read(
    @Param("id", uuid) id: string,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const { object } = await this.assets.read(id);
    const size = object.bytes.byteLength;
    reply
      .header("content-type", object.contentType)
      .header("content-disposition", "inline")
      .header("content-security-policy", ASSET_CSP)
      .header("cache-control", ASSET_CACHE_CONTROL)
      .header("accept-ranges", "bytes");

    // Audio players (Safari's especially) ask for ranges, to start and to seek.
    const range = parseByteRange(request.headers.range, size);
    if (range === "UNSATISFIABLE") {
      await reply
        .status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
        .header("content-range", `bytes */${size}`)
        .send();
      return;
    }
    if (range) {
      await reply
        .status(HttpStatus.PARTIAL_CONTENT)
        .header("content-range", `bytes ${range.start}-${range.end}/${size}`)
        .send(Buffer.from(object.bytes.subarray(range.start, range.end + 1)));
      return;
    }
    await reply.status(HttpStatus.OK).send(Buffer.from(object.bytes));
  }
}
