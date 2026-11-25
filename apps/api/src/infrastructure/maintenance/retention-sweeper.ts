import { Inject, Injectable } from "@nestjs/common";
import { type Database, tables } from "@qup/db";
import { type SQL, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

import { DATABASE } from "../database/database.module.js";
import { RETENTION } from "./retention-policy.js";

const { authSessions, oneTimeCodes, outboxEvents } = tables;

export interface RetentionReport {
  sessions: number;
  oneTimeCodes: number;
  outboxEvents: number;
}

/** Deletes operational rows past their retention (retention-policy.ts). Safe to run anywhere, any time. */
@Injectable()
export class RetentionSweeper {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async sweep(): Promise<RetentionReport> {
    const days = (count: number) => sql`now() - make_interval(days => ${count})`;
    return {
      // A session stopped mattering when it was signed out, or else when it expired.
      sessions: await this.deleteInBatches(
        authSessions,
        sql`coalesce(${authSessions.revokedAt}, ${authSessions.expiresAt}) < ${days(RETENTION.sessionDays)}`,
      ),
      oneTimeCodes: await this.deleteInBatches(
        oneTimeCodes,
        sql`${oneTimeCodes.createdAt} < ${days(RETENTION.oneTimeCodeDays)}`,
      ),
      outboxEvents: await this.deleteInBatches(
        outboxEvents,
        sql`${outboxEvents.status} = 'PUBLISHED' AND ${outboxEvents.publishedAt} < ${days(RETENTION.publishedOutboxDays)}`,
      ),
    };
  }

  /** Deletes matching rows a batch at a time; returns how many went. */
  private async deleteInBatches(table: PgTable & { id: unknown }, condition: SQL): Promise<number> {
    let total = 0;
    for (;;) {
      const deleted = await this.db.execute<{ id: string }>(sql`
        DELETE FROM ${table} WHERE id IN (
          SELECT id FROM ${table} WHERE ${condition} LIMIT ${RETENTION.deleteBatch}
        ) RETURNING id`);
      total += deleted.length;
      if (deleted.length < RETENTION.deleteBatch) return total;
    }
  }
}
