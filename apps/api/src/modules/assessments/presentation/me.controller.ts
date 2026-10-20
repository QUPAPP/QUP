import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Principal } from "../../auth/domain/principal.js";
import { CurrentPrincipal } from "../../auth/presentation/current-principal.decorator.js";
import { StudentDashboardService } from "../application/student-dashboard.service.js";

/** The signed-in student's own views. Identity comes from the session cookie only. */
@ApiTags("me")
@Controller("me")
export class MeController {
  constructor(private readonly dashboards: StudentDashboardService) {}

  @Get("dashboard")
  @ApiOperation({
    summary: "Per exam the student started or paid for: standing, strengths, gaps, next step.",
  })
  async dashboard(@CurrentPrincipal() principal: Principal) {
    return { exams: await this.dashboards.dashboard(principal.userId) };
  }
}
