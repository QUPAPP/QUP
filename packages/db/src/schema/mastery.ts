import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { createdAt, masteryStateEnum, primaryKeyId, updatedAt } from "./_shared.js";
import { questionAttempts } from "./assessment.js";
import { users } from "./identity.js";
import { exams, skills, subskills } from "./taxonomy.js";

/**
 * Mastery.
 *
 * The invariant that matters most (ADAPTIVE_ENGINE.md §22):
 *   "same attempt + learning node = one mastery event only"
 *
 * A plain UNIQUE (attempt_id, skill_id, subskill_id) does NOT achieve this:
 * in SQL, NULL is not equal to NULL, so two rows with the same attempt and the
 * same skill but a NULL subskill would both be accepted. The unique index below
 * coalesces the nullable node columns to a sentinel UUID so the comparison is
 * total.
 */

/** Sentinel for "no node at this level" inside unique expressions. */
const NIL_UUID = sql`'00000000-0000-0000-0000-000000000000'::uuid`;

export const studentMasteryStates = pgTable(
  "student_mastery_states",
  {
    id: primaryKeyId(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    examId: uuid("exam_id")
      .notNull()
      .references(() => exams.id, { onDelete: "restrict" }),
    skillId: uuid("skill_id").references(() => skills.id, { onDelete: "restrict" }),
    subskillId: uuid("subskill_id").references(() => subskills.id, { onDelete: "restrict" }),
    /** ADAPTIVE_ENGINE.md §2 — Beta-style prior: alpha = beta = 2. */
    alpha: numeric("alpha", { precision: 12, scale: 6 }).notNull().default("2.000000"),
    beta: numeric("beta", { precision: 12, scale: 6 }).notNull().default("2.000000"),
    masteryScore: numeric("mastery_score", { precision: 6, scale: 5 }).notNull().default("0.50000"),
    confidenceScore: numeric("confidence_score", { precision: 6, scale: 5 })
      .notNull()
      .default("0.00000"),
    evidenceCount: integer("evidence_count").notNull().default(0),
    distinctQuestionCount: integer("distinct_question_count").notNull().default(0),
    coverageScore: numeric("coverage_score", { precision: 6, scale: 5 })
      .notNull()
      .default("0.00000"),
    state: masteryStateEnum("state").notNull().default("UNASSESSED"),
    /** AGENTS.md §6 — every mastery update carries both versions. */
    algorithmVersion: text("algorithm_version").notNull(),
    configVersion: text("config_version").notNull(),
    /** ARCHITECTURE.md §9 — optimistic concurrency guard. */
    rowVersion: integer("row_version").notNull().default(0),
    lastEvidenceAt: timestamp("last_evidence_at", { withTimezone: true, mode: "date" }),
    lastReassessmentAt: timestamp("last_reassessment_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    // One state row per student + learning node (ERD.md).
    uniqueIndex("student_mastery_states_student_node_unique").on(
      table.studentId,
      sql`COALESCE(${table.skillId}, ${NIL_UUID})`,
      sql`COALESCE(${table.subskillId}, ${NIL_UUID})`,
    ),
    // ERD.md indexing: mastery by student/exam/state.
    index("student_mastery_states_student_exam_state_idx").on(
      table.studentId,
      table.examId,
      table.state,
    ),
    check(
      "student_mastery_states_exactly_one_node",
      sql`(${table.skillId} IS NOT NULL)::int + (${table.subskillId} IS NOT NULL)::int = 1`,
    ),
    check(
      "student_mastery_states_scores_range",
      sql`${table.masteryScore} >= 0 AND ${table.masteryScore} <= 1
          AND ${table.confidenceScore} >= 0 AND ${table.confidenceScore} <= 1
          AND ${table.coverageScore} >= 0 AND ${table.coverageScore} <= 1`,
    ),
    check("student_mastery_states_priors_positive", sql`${table.alpha} > 0 AND ${table.beta} > 0`),
    check(
      "student_mastery_states_counts_non_negative",
      sql`${table.evidenceCount} >= 0 AND ${table.distinctQuestionCount} >= 0`,
    ),
  ],
);

/**
 * Immutable evidence ledger. Rows are appended, never updated or deleted —
 * enforced by convention plus (later) a database role without UPDATE/DELETE on
 * this table.
 */
export const masteryEvents = pgTable(
  "mastery_events",
  {
    id: primaryKeyId(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => questionAttempts.id, { onDelete: "restrict" }),
    skillId: uuid("skill_id").references(() => skills.id, { onDelete: "restrict" }),
    subskillId: uuid("subskill_id").references(() => subskills.id, { onDelete: "restrict" }),
    beforeMastery: numeric("before_mastery", { precision: 6, scale: 5 }).notNull(),
    afterMastery: numeric("after_mastery", { precision: 6, scale: 5 }).notNull(),
    beforeConfidence: numeric("before_confidence", { precision: 6, scale: 5 }).notNull(),
    afterConfidence: numeric("after_confidence", { precision: 6, scale: 5 }).notNull(),
    positiveEvidence: numeric("positive_evidence", { precision: 12, scale: 6 })
      .notNull()
      .default("0.000000"),
    negativeEvidence: numeric("negative_evidence", { precision: 12, scale: 6 })
      .notNull()
      .default("0.000000"),
    reasonCode: text("reason_code").notNull(),
    difficulty: numeric("difficulty", { precision: 4, scale: 3 }).notNull(),
    attributionWeight: numeric("attribution_weight", { precision: 5, scale: 4 }).notNull(),
    algorithmVersion: text("algorithm_version").notNull(),
    configVersion: text("config_version").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    /**
     * THE critical constraint. COALESCE is required — see the module comment.
     * Without it, duplicate evidence from a retried request would slip through.
     */
    uniqueIndex("mastery_events_attempt_node_unique").on(
      table.attemptId,
      sql`COALESCE(${table.skillId}, ${NIL_UUID})`,
      sql`COALESCE(${table.subskillId}, ${NIL_UUID})`,
    ),
    // attempt_id lookups are served by the unique index above (leading column).
    index("mastery_events_student_created_idx").on(table.studentId, table.createdAt),
    check(
      "mastery_events_exactly_one_node",
      sql`(${table.skillId} IS NOT NULL)::int + (${table.subskillId} IS NOT NULL)::int = 1`,
    ),
    check(
      "mastery_events_evidence_non_negative",
      sql`${table.positiveEvidence} >= 0 AND ${table.negativeEvidence} >= 0`,
    ),
    check(
      "mastery_events_difficulty_range",
      sql`${table.difficulty} >= 0 AND ${table.difficulty} <= 1`,
    ),
  ],
);

/* -------------------------------------------------------------------------- */

export const studentMasteryStatesRelations = relations(studentMasteryStates, ({ one }) => ({
  student: one(users, { fields: [studentMasteryStates.studentId], references: [users.id] }),
  exam: one(exams, { fields: [studentMasteryStates.examId], references: [exams.id] }),
  skill: one(skills, { fields: [studentMasteryStates.skillId], references: [skills.id] }),
  subskill: one(subskills, {
    fields: [studentMasteryStates.subskillId],
    references: [subskills.id],
  }),
}));

export const masteryEventsRelations = relations(masteryEvents, ({ one }) => ({
  student: one(users, { fields: [masteryEvents.studentId], references: [users.id] }),
  attempt: one(questionAttempts, {
    fields: [masteryEvents.attemptId],
    references: [questionAttempts.id],
  }),
  skill: one(skills, { fields: [masteryEvents.skillId], references: [skills.id] }),
  subskill: one(subskills, { fields: [masteryEvents.subskillId], references: [subskills.id] }),
}));
