import { relations, sql } from "drizzle-orm";
import { check, index, jsonb, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { adaptiveSessionStatusEnum, createdAt, primaryKeyId } from "./_shared.js";
import { users } from "./identity.js";
import { questionVersions } from "./questions.js";
import { exams, skills, subskills } from "./taxonomy.js";

/**
 * Adaptive selection.
 *
 * AGENTS.md §6 — "كل Adaptive Decision قابل للتفسير والتدقيق". Every decision
 * stores the inputs it was made from (mastery/confidence snapshot, target
 * difficulty, candidate set) plus the engine and config versions, so any past
 * selection can be explained and replayed.
 */

export const adaptiveSessions = pgTable(
  "adaptive_sessions",
  {
    id: primaryKeyId(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    examId: uuid("exam_id")
      .notNull()
      .references(() => exams.id, { onDelete: "restrict" }),
    targetSkillId: uuid("target_skill_id").references(() => skills.id, { onDelete: "restrict" }),
    targetSubskillId: uuid("target_subskill_id").references(() => subskills.id, {
      onDelete: "restrict",
    }),
    status: adaptiveSessionStatusEnum("status").notNull().default("ACTIVE"),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    endedAt: timestamp("ended_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
  },
  (table) => [
    index("adaptive_sessions_student_status_idx").on(table.studentId, table.status),
    check(
      "adaptive_sessions_at_most_one_target",
      sql`(${table.targetSkillId} IS NOT NULL)::int + (${table.targetSubskillId} IS NOT NULL)::int <= 1`,
    ),
  ],
);

export const adaptiveDecisions = pgTable(
  "adaptive_decisions",
  {
    id: primaryKeyId(),
    adaptiveSessionId: uuid("adaptive_session_id").references(() => adaptiveSessions.id, {
      onDelete: "cascade",
    }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    targetSkillId: uuid("target_skill_id").references(() => skills.id, { onDelete: "restrict" }),
    targetSubskillId: uuid("target_subskill_id").references(() => subskills.id, {
      onDelete: "restrict",
    }),
    /** Snapshot at decision time — not a live join, so history stays truthful. */
    masterySnapshot: numeric("mastery_snapshot", { precision: 6, scale: 5 }),
    confidenceSnapshot: numeric("confidence_snapshot", { precision: 6, scale: 5 }),
    /** ADAPTIVE_ENGINE.md §17 — clamped to [0.20, 0.90]. */
    targetDifficulty: numeric("target_difficulty", { precision: 4, scale: 3 }),
    candidateSnapshot: jsonb("candidate_snapshot"),
    selectedQuestionVersionId: uuid("selected_question_version_id").references(
      () => questionVersions.id,
      { onDelete: "restrict" },
    ),
    reasonCodes: jsonb("reason_codes"),
    engineVersion: text("engine_version").notNull(),
    configVersion: text("config_version").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    // ERD.md indexing: adaptive decisions by session/time.
    index("adaptive_decisions_session_created_idx").on(table.adaptiveSessionId, table.createdAt),
    index("adaptive_decisions_student_created_idx").on(table.studentId, table.createdAt),
    check(
      "adaptive_decisions_exactly_one_target",
      sql`(${table.targetSkillId} IS NOT NULL)::int + (${table.targetSubskillId} IS NOT NULL)::int = 1`,
    ),
    check(
      "adaptive_decisions_target_difficulty_range",
      sql`${table.targetDifficulty} IS NULL OR (${table.targetDifficulty} >= 0 AND ${table.targetDifficulty} <= 1)`,
    ),
  ],
);

/* -------------------------------------------------------------------------- */

export const adaptiveSessionsRelations = relations(adaptiveSessions, ({ one, many }) => ({
  student: one(users, { fields: [adaptiveSessions.studentId], references: [users.id] }),
  exam: one(exams, { fields: [adaptiveSessions.examId], references: [exams.id] }),
  decisions: many(adaptiveDecisions),
}));

export const adaptiveDecisionsRelations = relations(adaptiveDecisions, ({ one }) => ({
  adaptiveSession: one(adaptiveSessions, {
    fields: [adaptiveDecisions.adaptiveSessionId],
    references: [adaptiveSessions.id],
  }),
  student: one(users, { fields: [adaptiveDecisions.studentId], references: [users.id] }),
  selectedQuestionVersion: one(questionVersions, {
    fields: [adaptiveDecisions.selectedQuestionVersionId],
    references: [questionVersions.id],
  }),
}));
