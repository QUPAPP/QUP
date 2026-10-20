import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { AuditReadService } from "./application/audit-read.service.js";
import { AdminAuditController } from "./presentation/admin-audit.controller.js";

/**
 * Audit (AGENTS.md §5): reading the durable business and security record and
 * the outbox's health. Writing audit entries stays with each change
 * (infrastructure/audit/audit-log.ts), inside its own transaction.
 */
@Module({
  imports: [AuthModule],
  controllers: [AdminAuditController],
  providers: [AuditReadService],
})
export class AuditModule {}
