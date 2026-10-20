import { Controller, Get, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import {
  type AnalyticsWindowQuery,
  analyticsWindowQuery,
} from "../../../common/validation/analytics-window.js";
import { ZodValidationPipe } from "../../../common/validation/zod-validation.pipe.js";
import { Permission } from "../../rbac/permissions.js";
import { RequirePermissions } from "../../rbac/require-permissions.js";
import { AnalyticsService } from "../application/analytics.service.js";

/** API_CONTRACTS.md "Admin Analytics/Audit". ADMIN only (audit.view). */
@ApiTags("admin: analytics")
@RequirePermissions(Permission.AuditView)
@Controller("admin/analytics")
export class AdminAnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get("learning")
  @ApiOperation({ summary: "Diagnostics, training, answers and reassessments over 7 or 30 days." })
  learning(@Query(new ZodValidationPipe(analyticsWindowQuery)) query: AnalyticsWindowQuery) {
    return this.analytics.learning(query.days);
  }
}
