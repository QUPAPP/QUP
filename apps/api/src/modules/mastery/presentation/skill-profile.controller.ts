import { Controller, Get, Param } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { uuidParam } from "../../../common/validation/schemas.js";
import { ZodValidationPipe } from "../../../common/validation/zod-validation.pipe.js";
import type { Principal } from "../../auth/domain/principal.js";
import { CurrentPrincipal } from "../../auth/presentation/current-principal.decorator.js";
import { type SkillProfile, SkillProfileService } from "../application/skill-profile.service.js";

/** The signed-in student's own profile; no route takes a student id (no IDOR). */
@ApiTags("mastery")
@Controller("exams")
export class SkillProfileController {
  constructor(private readonly profiles: SkillProfileService) {}

  @Get(":examId/skill-profile")
  @ApiOperation({ summary: "The student's skills, states and ranked gaps for a paid exam." })
  profile(
    @CurrentPrincipal() principal: Principal,
    @Param("examId", new ZodValidationPipe(uuidParam)) examId: string,
  ): Promise<SkillProfile> {
    return this.profiles.profile(principal.userId, examId);
  }
}
