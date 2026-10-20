import { Controller, Get, Inject, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { type Database, tables } from "@qup/db";
import { gte, sql } from "drizzle-orm";

import {
  type AnalyticsWindowQuery,
  analyticsWindowQuery,
} from "../../../common/validation/analytics-window.js";
import { ZodValidationPipe } from "../../../common/validation/zod-validation.pipe.js";
import { DATABASE } from "../../../infrastructure/database/database.module.js";
import { Permission } from "../../rbac/permissions.js";
import { RequirePermissions } from "../../rbac/require-permissions.js";

const { importBatches } = tables;
const DAY_MS = 86_400_000;

/** Import metrics (OBSERVABILITY.md "Content: import success/fail, duplicate detections"). */
@ApiTags("admin: analytics")
@RequirePermissions(Permission.AuditView)
@Controller("admin/analytics")
export class AdminImportAnalyticsController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  @Get("imports")
  @ApiOperation({ summary: "Import batches by status and their rows, over 7 or 30 days." })
  async imports(@Query(new ZodValidationPipe(analyticsWindowQuery)) query: AnalyticsWindowQuery) {
    const since = new Date(Date.now() - query.days * DAY_MS);
    const total = (key: string) =>
      sql<number>`coalesce(sum((${importBatches.totals}->>${key})::int), 0)::int`;
    const rows = await this.db
      .select({
        status: importBatches.status,
        batches: sql<number>`count(*)::int`,
        imported: total("imported"),
        invalid: total("invalid"),
        duplicate: total("duplicate"),
        skipped: total("skipped"),
      })
      .from(importBatches)
      .where(gte(importBatches.createdAt, since))
      .groupBy(importBatches.status);
    const sum = (key: "imported" | "invalid" | "duplicate" | "skipped") =>
      rows.reduce((acc, row) => acc + row[key], 0);
    return {
      days: query.days,
      batches: Object.fromEntries(rows.map((row) => [row.status, row.batches])),
      rows: {
        imported: sum("imported"),
        invalid: sum("invalid"),
        duplicate: sum("duplicate"),
        skipped: sum("skipped"),
      },
    };
  }
}
