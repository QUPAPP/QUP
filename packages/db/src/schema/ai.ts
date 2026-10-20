import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { aiRunStatusEnum, createdAt, primaryKeyId } from "./_shared.js";
import { users } from "./identity.js";

/**
 * AI (AI_INTEGRATION.md "Observability"): one row per AI run, whatever its
 * outcome. Never the prompt or any key; `output` only for validated output.
 */
export const aiRuns = pgTable(
  "ai_runs",
  {
    id: primaryKeyId(),
    task: text("task").notNull(),
    promptVersion: text("prompt_version").notNull(),
    schemaVersion: text("schema_version").notNull(),
    provider: text("provider").notNull(),
    model: text("model"),
    status: aiRunStatusEnum("status").notNull(),
    attempts: integer("attempts").notNull(),
    latencyMs: integer("latency_ms").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    errorCode: text("error_code"),
    requestedBy: uuid("requested_by").references(() => users.id, { onDelete: "set null" }),
    /** What the run was about, e.g. `question_version` and its id. */
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    output: jsonb("output"),
    createdAt: createdAt(),
  },
  (table) => [
    index("ai_runs_created_idx").on(table.createdAt),
    index("ai_runs_subject_idx").on(table.subjectType, table.subjectId),
    index("ai_runs_requested_by_idx").on(table.requestedBy, table.createdAt),
    check("ai_runs_counts_non_negative", sql`${table.attempts} >= 0 AND ${table.latencyMs} >= 0`),
    check(
      "ai_runs_output_only_on_success",
      sql`${table.output} IS NULL OR ${table.status} = 'SUCCEEDED'`,
    ),
  ],
);
