import { Controller, Get, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";

import { ZodValidationPipe } from "../../../common/validation/zod-validation.pipe.js";
import { Permission } from "../../rbac/permissions.js";
import { RequirePermissions } from "../../rbac/require-permissions.js";
import { AuditReadService } from "../application/audit-read.service.js";

const PAGE_MAX = 100;
const DEFAULT_PAGE = 50;
const TEXT_MAX = 200;

const auditQuery = z.strictObject({
  action: z.string().trim().min(1).max(TEXT_MAX).optional(),
  resourceType: z.string().trim().min(1).max(TEXT_MAX).optional(),
  resourceId: z.string().trim().min(1).max(TEXT_MAX).optional(),
  actorId: z.uuid().optional(),
  from: z.iso
    .datetime({ offset: true })
    .transform((value) => new Date(value))
    .optional(),
  to: z.iso
    .datetime({ offset: true })
    .transform((value) => new Date(value))
    .optional(),
  limit: z.coerce.number().int().min(1).max(PAGE_MAX).default(DEFAULT_PAGE),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});
type AuditQuery = z.output<typeof auditQuery>;

/** API_CONTRACTS.md "Admin Analytics/Audit". ADMIN only (audit.view). */
@ApiTags("admin: audit")
@RequirePermissions(Permission.AuditView)
@Controller("admin")
export class AdminAuditController {
  constructor(private readonly audit: AuditReadService) {}

  @Get("audit-logs")
  @ApiOperation({ summary: "The audit log, newest first, with optional filters." })
  async auditLogs(@Query(new ZodValidationPipe(auditQuery)) query: AuditQuery) {
    const { items, hasMore } = await this.audit.auditLogs(query);
    return { items, page: { limit: query.limit, offset: query.offset, hasMore } };
  }

  @Get("operations/outbox")
  @ApiOperation({ summary: "Outbox depth, age and recent failures." })
  outbox() {
    return this.audit.outboxStatus();
  }
}
