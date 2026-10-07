import { Controller, Get, HttpStatus, Res } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import type { FastifyReply } from "fastify";

import {
  AUTH_THROTTLER,
  GLOBAL_THROTTLER,
} from "../../infrastructure/rate-limit/rate-limit.module.js";
import { Public } from "../auth/presentation/public.decorator.js";

// HealthService must be a value import: Nest resolves it from decorator metadata.
import { HealthService, type ReadinessReport } from "./health.service.js";

/**
 * Served outside /api/v1 (see create-app.ts): probes belong to the platform,
 * not to the versioned public API.
 */
@ApiTags("health")
@Public()
@SkipThrottle({ [GLOBAL_THROTTLER]: true, [AUTH_THROTTLER]: true })
@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get("live")
  @ApiOperation({ summary: "Liveness: the process is up. Checks no dependencies." })
  live(): { status: "ok" } {
    return { status: "ok" };
  }

  @Get("ready")
  @ApiOperation({ summary: "Readiness: dependencies are reachable. 503 when they are not." })
  async ready(@Res({ passthrough: true }) reply: FastifyReply): Promise<ReadinessReport> {
    const report = await this.health.readiness();
    if (report.status !== "ok") reply.status(HttpStatus.SERVICE_UNAVAILABLE);
    return report;
  }
}
