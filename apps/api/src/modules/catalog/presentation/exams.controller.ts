import { Controller, Get, Param } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { uuidParam } from "../../../common/validation/schemas.js";
import { ZodValidationPipe } from "../../../common/validation/zod-validation.pipe.js";
import { ExamsService } from "../application/exams.service.js";
import { type PublicExamView, toPublicExamView } from "./catalog.views.js";

/**
 * API_CONTRACTS.md "Exams — Student". Requires a signed-in user (PRD §4: an
 * account is mandatory before the free part) but no permission.
 */
@ApiTags("exams")
@Controller("exams")
export class ExamsController {
  constructor(private readonly exams: ExamsService) {}

  @Get()
  @ApiOperation({ summary: "Exams currently offered to students." })
  async list(): Promise<{ items: PublicExamView[] }> {
    return { items: (await this.exams.listAvailable()).map(toPublicExamView) };
  }

  @Get(":examId")
  @ApiOperation({
    summary: "One offered exam. Drafts and archived exams are reported as not found.",
  })
  async get(
    @Param("examId", new ZodValidationPipe(uuidParam)) examId: string,
  ): Promise<PublicExamView> {
    return toPublicExamView(await this.exams.getAvailable(examId));
  }
}
