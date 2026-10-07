import { Inject, Injectable } from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import {
  DATABASE_HEALTH,
  type DatabaseHealth,
} from "../../infrastructure/database/database.module.js";

export interface ReadinessReport {
  status: "ok" | "unavailable";
  checks: { database: "up" | "down" };
}

/** Kept well under typical load-balancer probe timeouts so the probe itself never hangs. */
const DATABASE_PING_TIMEOUT_MS = 2_000;

@Injectable()
export class HealthService {
  constructor(
    @Inject(DATABASE_HEALTH) private readonly database: DatabaseHealth,
    @InjectPinoLogger(HealthService.name) private readonly logger: PinoLogger,
  ) {}

  async readiness(): Promise<ReadinessReport> {
    try {
      await this.database.ping(DATABASE_PING_TIMEOUT_MS);
      return { status: "ok", checks: { database: "up" } };
    } catch (error) {
      // Details stay in the server log; the probe response says only "down".
      this.logger.warn({ err: error }, "Readiness check failed: database unreachable");
      return { status: "unavailable", checks: { database: "down" } };
    }
  }
}
