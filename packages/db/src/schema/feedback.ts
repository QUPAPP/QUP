import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import {
  createdAt,
  primaryKeyId,
  questionReportReasonEnum,
  questionReportStatusEnum,
} from "./_shared.js";
import { users } from "./identity.js";
import { questions, questionVersions } from "./questions.js";

/**
 * A student's report of a problem in a question they were shown: a wrong
 * answer key, unclear wording or a typo. Reviewers resolve or dismiss it; a
 * fix goes through a new question version as usual.
 */
export const questionReports = pgTable(
  "question_reports",
  {
    id: primaryKeyId(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "restrict" }),
    questionVersionId: uuid("question_version_id")
      .notNull()
      .references(() => questionVersions.id, { onDelete: "restrict" }),
    reportedBy: uuid("reported_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reason: questionReportReasonEnum("reason").notNull(),
    note: text("note"),
    status: questionReportStatusEnum("status").notNull().default("OPEN"),
    resolutionNote: text("resolution_note"),
    resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    index("question_reports_status_idx").on(table.status, table.createdAt),
    index("question_reports_question_idx").on(table.questionId),
    // One open report per student and version: a second press updates nothing.
    uniqueIndex("question_reports_one_open_per_student")
      .on(table.reportedBy, table.questionVersionId)
      .where(sql`${table.status} = 'OPEN'`),
    check("question_reports_note_length", sql`char_length(${table.note}) <= 1000`),
    check(
      "question_reports_resolution_consistent",
      sql`(${table.status} = 'OPEN') = (${table.resolvedAt} IS NULL)`,
    ),
  ],
);
