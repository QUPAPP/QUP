import { Inject, Injectable } from "@nestjs/common";
import { type Database, tables } from "@qup/db";
import { and, count, desc, eq, type SQL } from "drizzle-orm";

import { DATABASE } from "../../../infrastructure/database/database.module.js";
import type {
  NewReport,
  QuestionReport,
  ReportClosing,
  ReportStatus,
  ReportStore,
} from "../domain/question-report.js";

const { questionReports } = tables;

@Injectable()
export class DrizzleReportStore implements ReportStore {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async openOnce(report: NewReport) {
    const [created] = await this.db
      .insert(questionReports)
      .values(report)
      .onConflictDoNothing()
      .returning();
    if (created) return { report: created, created: true };
    const [existing] = await this.db
      .select()
      .from(questionReports)
      .where(
        and(
          eq(questionReports.reportedBy, report.reportedBy),
          eq(questionReports.questionVersionId, report.questionVersionId),
          eq(questionReports.status, "OPEN"),
        ),
      )
      .limit(1);
    if (!existing) throw new Error("A conflicting open report vanished.");
    return { report: existing, created: false };
  }

  async find(id: string): Promise<QuestionReport | null> {
    const [row] = await this.db
      .select()
      .from(questionReports)
      .where(eq(questionReports.id, id))
      .limit(1);
    return row ?? null;
  }

  async list(query: { status: ReportStatus | null; limit: number; offset: number }) {
    const where: SQL | undefined = query.status
      ? eq(questionReports.status, query.status)
      : undefined;
    const rows = await this.db
      .select()
      .from(questionReports)
      .where(where)
      .orderBy(desc(questionReports.createdAt), desc(questionReports.id))
      .limit(query.limit + 1)
      .offset(query.offset);
    return { items: rows.slice(0, query.limit), hasMore: rows.length > query.limit };
  }

  async openCount(): Promise<number> {
    const [row] = await this.db
      .select({ reports: count() })
      .from(questionReports)
      .where(eq(questionReports.status, "OPEN"));
    return row?.reports ?? 0;
  }

  async close(id: string, closing: { status: ReportClosing; note: string | null; by: string }) {
    const [row] = await this.db
      .update(questionReports)
      .set({
        status: closing.status,
        resolutionNote: closing.note,
        resolvedBy: closing.by,
        resolvedAt: new Date(),
      })
      .where(and(eq(questionReports.id, id), eq(questionReports.status, "OPEN")))
      .returning();
    return row ?? null;
  }
}
