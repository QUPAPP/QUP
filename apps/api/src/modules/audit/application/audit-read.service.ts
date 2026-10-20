import { Inject, Injectable } from "@nestjs/common";
import { type Database, tables } from "@qup/db";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";

import { DATABASE } from "../../../infrastructure/database/database.module.js";
import { USER_DIRECTORY, type UserDirectory } from "../../auth/auth.contract.js";

const { auditLogs, outboxEvents } = tables;

/** How many recent outbox failures the operations card lists. */
const RECENT_FAILURES = 10;

export interface AuditLogFilter {
  action?: string;
  resourceType?: string;
  resourceId?: string;
  actorId?: string;
  from?: Date;
  to?: Date;
  limit: number;
  offset: number;
}

/**
 * Read side of the durable records (OBSERVABILITY.md "Audit Log vs App Log"):
 * the audit log, and the outbox's health ("queue depth/failures"). Metadata
 * was redacted when it was written (SECURITY.md); it is shown as stored.
 */
@Injectable()
export class AuditReadService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(USER_DIRECTORY) private readonly users: UserDirectory,
  ) {}

  async auditLogs(filter: AuditLogFilter) {
    const rows = await this.db
      .select()
      .from(auditLogs)
      .where(
        and(
          filter.action ? eq(auditLogs.action, filter.action) : undefined,
          filter.resourceType ? eq(auditLogs.resourceType, filter.resourceType) : undefined,
          filter.resourceId ? eq(auditLogs.resourceId, filter.resourceId) : undefined,
          filter.actorId ? eq(auditLogs.actorId, filter.actorId) : undefined,
          filter.from ? gte(auditLogs.createdAt, filter.from) : undefined,
          filter.to ? lte(auditLogs.createdAt, filter.to) : undefined,
        ),
      )
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(filter.limit + 1)
      .offset(filter.offset);
    const page = rows.slice(0, filter.limit);
    const actors = await this.users.describe([
      ...new Set(page.flatMap((row) => (row.actorId ? [row.actorId] : []))),
    ]);
    return {
      items: page.map((row) => ({
        id: row.id,
        action: row.action,
        resourceType: row.resourceType,
        resourceId: row.resourceId,
        actor: row.actorId
          ? { id: row.actorId, ...(actors.get(row.actorId) ?? { email: null, displayName: null }) }
          : null,
        requestId: row.requestId,
        metadata: row.metadataRedacted,
        createdAt: row.createdAt.toISOString(),
      })),
      hasMore: rows.length > filter.limit,
    };
  }

  /** Two queries: counts and age, then the latest failures. */
  async outboxStatus() {
    const [counts] = await this.db
      .select({
        pending: sql<number>`count(*) FILTER (WHERE ${outboxEvents.status} = 'PENDING')::int`,
        processing: sql<number>`count(*) FILTER (WHERE ${outboxEvents.status} = 'PROCESSING')::int`,
        failed: sql<number>`count(*) FILTER (WHERE ${outboxEvents.status} = 'FAILED')::int`,
        published24h: sql<number>`count(*) FILTER (WHERE ${outboxEvents.status} = 'PUBLISHED' AND ${outboxEvents.publishedAt} > now() - interval '24 hours')::int`,
        oldestPendingSeconds: sql<
          number | null
        >`extract(epoch from now() - min(${outboxEvents.createdAt}) FILTER (WHERE ${outboxEvents.status} = 'PENDING'))::int`,
      })
      .from(outboxEvents);
    const failures = await this.db
      .select({
        id: outboxEvents.id,
        eventType: outboxEvents.eventType,
        attempts: outboxEvents.attempts,
        lastError: outboxEvents.lastError,
        createdAt: outboxEvents.createdAt,
      })
      .from(outboxEvents)
      .where(eq(outboxEvents.status, "FAILED"))
      .orderBy(desc(outboxEvents.createdAt))
      .limit(RECENT_FAILURES);
    return {
      pending: counts?.pending ?? 0,
      processing: counts?.processing ?? 0,
      failed: counts?.failed ?? 0,
      published24h: counts?.published24h ?? 0,
      oldestPendingSeconds: counts?.oldestPendingSeconds ?? null,
      recentFailures: failures.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    };
  }
}
