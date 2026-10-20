import { Inject, Injectable } from "@nestjs/common";
import { AI_RUN_STATUSES, type AiRunStatus } from "@qup/ai-gateway";
import { type Database, tables } from "@qup/db";
import { count, desc, gte } from "drizzle-orm";

import { DATABASE } from "../../../infrastructure/database/database.module.js";
import type { AiRunEntry, AiRunStore, StoredAiRun } from "../domain/ports.js";

const { aiRuns } = tables;

@Injectable()
export class DrizzleAiRunStore implements AiRunStore {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async record(entry: AiRunEntry): Promise<void> {
    await this.db.insert(aiRuns).values({
      task: entry.task,
      promptVersion: entry.promptVersion,
      schemaVersion: entry.schemaVersion,
      provider: entry.provider,
      model: entry.model,
      status: entry.status,
      attempts: entry.attempts,
      latencyMs: entry.latencyMs,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      errorCode: entry.errorCode,
      requestedBy: entry.requestedBy,
      subjectType: entry.subjectType,
      subjectId: entry.subjectId,
      output: entry.status === "SUCCEEDED" ? entry.output : null,
    });
  }

  async recent(page: { limit: number; offset: number }) {
    const rows = await this.db
      .select({
        id: aiRuns.id,
        task: aiRuns.task,
        promptVersion: aiRuns.promptVersion,
        schemaVersion: aiRuns.schemaVersion,
        provider: aiRuns.provider,
        model: aiRuns.model,
        status: aiRuns.status,
        attempts: aiRuns.attempts,
        latencyMs: aiRuns.latencyMs,
        inputTokens: aiRuns.inputTokens,
        outputTokens: aiRuns.outputTokens,
        errorCode: aiRuns.errorCode,
        requestedBy: aiRuns.requestedBy,
        subjectType: aiRuns.subjectType,
        subjectId: aiRuns.subjectId,
        createdAt: aiRuns.createdAt,
      })
      .from(aiRuns)
      .orderBy(desc(aiRuns.createdAt), desc(aiRuns.id))
      .limit(page.limit + 1)
      .offset(page.offset);
    const items: StoredAiRun[] = rows.slice(0, page.limit);
    return { items, hasMore: rows.length > page.limit };
  }

  async countsSince(since: Date): Promise<Record<AiRunStatus, number>> {
    const rows = await this.db
      .select({ status: aiRuns.status, runs: count() })
      .from(aiRuns)
      .where(gte(aiRuns.createdAt, since))
      .groupBy(aiRuns.status);
    const counts = Object.fromEntries(AI_RUN_STATUSES.map((status) => [status, 0])) as Record<
      AiRunStatus,
      number
    >;
    for (const row of rows) counts[row.status] = row.runs;
    return counts;
  }
}
