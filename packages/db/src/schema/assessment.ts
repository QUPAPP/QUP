import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  assessmentSessionStatusEnum,
  attemptResultTypeEnum,
  blueprintStatusEnum,
  blueprintTypeEnum,
  createdAt,
  itemSelectedByEnum,
  primaryKeyId,
  updatedAt,
} from "./_shared.js";
import { adaptiveDecisions } from "./adaptive.js";
import { users } from "./identity.js";
import { questionVersions } from "./questions.js";
import { domains, exams, skills, subskills, taxonomyVersions } from "./taxonomy.js";

/**
 * Assessment.
 *
 * Invariants from DOMAIN_MODEL.md §3 that the database enforces directly:
 *  - one attempt per assessment item  (a finalized item is never re-graded)
 *  - idempotency keys are unique      (a replayed submit cannot double-record)
 *
 * Ownership checks ("a student may not answer an item outside their session")
 * are authorization concerns and live in the application layer.
 */

export const assessmentBlueprints = pgTable(
  "assessment_blueprints",
  {
    id: primaryKeyId(),
    examId: uuid("exam_id")
      .notNull()
      .references(() => exams.id, { onDelete: "restrict" }),
    taxonomyVersionId: uuid("taxonomy_version_id")
      .notNull()
      .references(() => taxonomyVersions.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    type: blueprintTypeEnum("type").notNull(),
    name: text("name").notNull(),
    minQuestions: integer("min_questions").notNull(),
    maxQuestions: integer("max_questions").notNull(),
    timeLimitSeconds: integer("time_limit_seconds"),
    status: blueprintStatusEnum("status").notNull().default("DRAFT"),
    configVersion: text("config_version").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("assessment_blueprints_exam_code_unique").on(table.examId, table.code),
    index("assessment_blueprints_exam_type_status_idx").on(table.examId, table.type, table.status),
    check(
      "assessment_blueprints_question_bounds",
      sql`${table.minQuestions} >= 1 AND ${table.maxQuestions} >= ${table.minQuestions}`,
    ),
  ],
);

export const blueprintRules = pgTable(
  "blueprint_rules",
  {
    id: primaryKeyId(),
    blueprintId: uuid("blueprint_id")
      .notNull()
      .references(() => assessmentBlueprints.id, { onDelete: "cascade" }),
    domainId: uuid("domain_id").references(() => domains.id, { onDelete: "restrict" }),
    skillId: uuid("skill_id").references(() => skills.id, { onDelete: "restrict" }),
    subskillId: uuid("subskill_id").references(() => subskills.id, { onDelete: "restrict" }),
    minCount: integer("min_count"),
    maxCount: integer("max_count"),
    targetWeight: numeric("target_weight", { precision: 6, scale: 4 }),
    difficultyMin: numeric("difficulty_min", { precision: 4, scale: 3 }),
    difficultyMax: numeric("difficulty_max", { precision: 4, scale: 3 }),
    createdAt: createdAt(),
  },
  (table) => [
    index("blueprint_rules_blueprint_idx").on(table.blueprintId),
    // A rule targets at most one node level; a rule with none applies to the whole blueprint.
    check(
      "blueprint_rules_at_most_one_node",
      sql`(${table.domainId} IS NOT NULL)::int + (${table.skillId} IS NOT NULL)::int + (${table.subskillId} IS NOT NULL)::int <= 1`,
    ),
    check(
      "blueprint_rules_count_bounds",
      sql`${table.minCount} IS NULL OR ${table.maxCount} IS NULL OR ${table.maxCount} >= ${table.minCount}`,
    ),
    check(
      "blueprint_rules_difficulty_bounds",
      sql`${table.difficultyMin} IS NULL OR ${table.difficultyMax} IS NULL OR ${table.difficultyMax} >= ${table.difficultyMin}`,
    ),
  ],
);

export const assessmentSessions = pgTable(
  "assessment_sessions",
  {
    id: primaryKeyId(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /**
     * Every session belongs to one exam (PRD §4: each exam has its own skill
     * profile). Stored directly: a session may have no blueprint row (a
     * default-sized mini diagnostic), and "does this student have an open
     * session for this exam" must not need a join through its items.
     */
    examId: uuid("exam_id")
      .notNull()
      .references(() => exams.id, { onDelete: "restrict" }),
    blueprintId: uuid("blueprint_id").references(() => assessmentBlueprints.id, {
      onDelete: "restrict",
    }),
    /** Snapshot of the blueprint type: the blueprint may evolve, history may not. */
    type: blueprintTypeEnum("type").notNull(),
    status: assessmentSessionStatusEnum("status").notNull().default("CREATED"),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
    scoringVersion: text("scoring_version").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    // ERD.md indexing: sessions by student/status.
    index("assessment_sessions_student_status_idx").on(table.studentId, table.status),
    index("assessment_sessions_expires_idx").on(table.expiresAt),
    index("assessment_sessions_student_exam_type_idx").on(
      table.studentId,
      table.examId,
      table.type,
    ),
    // One unfinished session per student, exam and type: a double-clicked
    // "start" resumes the open session instead of creating a second one.
    uniqueIndex("assessment_sessions_one_open")
      .on(table.studentId, table.examId, table.type)
      .where(sql`status IN ('CREATED', 'IN_PROGRESS')`),
  ],
);

export const assessmentItems = pgTable(
  "assessment_items",
  {
    id: primaryKeyId(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => assessmentSessions.id, { onDelete: "cascade" }),
    questionVersionId: uuid("question_version_id")
      .notNull()
      .references(() => questionVersions.id, { onDelete: "restrict" }),
    ordinal: integer("ordinal").notNull(),
    selectedBy: itemSelectedByEnum("selected_by").notNull(),
    /** Set when selectedBy = ADAPTIVE: links the item to the auditable decision that chose it. */
    adaptiveDecisionId: uuid("adaptive_decision_id").references(() => adaptiveDecisions.id, {
      onDelete: "restrict",
    }),
    presentedAt: timestamp("presented_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
  },
  (table) => [
    // Also serves session_id lookups (leading column).
    uniqueIndex("assessment_items_session_ordinal_unique").on(table.sessionId, table.ordinal),
    index("assessment_items_question_version_idx").on(table.questionVersionId),
    check(
      "assessment_items_decision_only_when_adaptive",
      sql`${table.adaptiveDecisionId} IS NULL OR ${table.selectedBy} = 'ADAPTIVE'`,
    ),
    check("assessment_items_ordinal_positive", sql`${table.ordinal} >= 1`),
  ],
);

/**
 * One attempt per item, enforced by the database.
 *
 * DOMAIN_MODEL.md §3: "Item finalized لا يعاد grading له". Without the unique
 * constraint on assessment_item_id, a duplicate submit would create a second
 * attempt and therefore a second round of mastery evidence.
 */
export const questionAttempts = pgTable(
  "question_attempts",
  {
    id: primaryKeyId(),
    assessmentItemId: uuid("assessment_item_id")
      .notNull()
      .references(() => assessmentItems.id, { onDelete: "restrict" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    submittedAnswer: jsonb("submitted_answer"),
    isCorrect: boolean("is_correct"),
    resultType: attemptResultTypeEnum("result_type").notNull(),
    hintUsed: boolean("hint_used").notNull().default(false),
    answerRevealed: boolean("answer_revealed").notNull().default(false),
    /** ADAPTIVE_ENGINE.md §11 — recorded, but deliberately not used in V1 scoring. */
    responseTimeMs: integer("response_time_ms"),
    finalizedAt: timestamp("finalized_at", { withTimezone: true, mode: "date" }),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("question_attempts_item_unique").on(table.assessmentItemId),
    uniqueIndex("question_attempts_idempotency_key_unique").on(table.idempotencyKey),
    // ERD.md indexing: attempts by student/time.
    index("question_attempts_student_created_idx").on(table.studentId, table.createdAt),
    check(
      "question_attempts_response_time_non_negative",
      sql`${table.responseTimeMs} IS NULL OR ${table.responseTimeMs} >= 0`,
    ),
    // An ANSWERED attempt must have been graded; SKIPPED/TIMEOUT must not be.
    check(
      "question_attempts_correctness_matches_result",
      sql`(${table.resultType} = 'ANSWERED' AND ${table.isCorrect} IS NOT NULL)
          OR (${table.resultType} <> 'ANSWERED' AND ${table.isCorrect} IS NULL)`,
    ),
  ],
);

/* -------------------------------------------------------------------------- */

export const assessmentBlueprintsRelations = relations(assessmentBlueprints, ({ one, many }) => ({
  exam: one(exams, { fields: [assessmentBlueprints.examId], references: [exams.id] }),
  taxonomyVersion: one(taxonomyVersions, {
    fields: [assessmentBlueprints.taxonomyVersionId],
    references: [taxonomyVersions.id],
  }),
  rules: many(blueprintRules),
  sessions: many(assessmentSessions),
}));

export const blueprintRulesRelations = relations(blueprintRules, ({ one }) => ({
  blueprint: one(assessmentBlueprints, {
    fields: [blueprintRules.blueprintId],
    references: [assessmentBlueprints.id],
  }),
}));

export const assessmentSessionsRelations = relations(assessmentSessions, ({ one, many }) => ({
  student: one(users, { fields: [assessmentSessions.studentId], references: [users.id] }),
  blueprint: one(assessmentBlueprints, {
    fields: [assessmentSessions.blueprintId],
    references: [assessmentBlueprints.id],
  }),
  items: many(assessmentItems),
}));

export const assessmentItemsRelations = relations(assessmentItems, ({ one }) => ({
  session: one(assessmentSessions, {
    fields: [assessmentItems.sessionId],
    references: [assessmentSessions.id],
  }),
  questionVersion: one(questionVersions, {
    fields: [assessmentItems.questionVersionId],
    references: [questionVersions.id],
  }),
  attempt: one(questionAttempts),
}));

export const questionAttemptsRelations = relations(questionAttempts, ({ one }) => ({
  assessmentItem: one(assessmentItems, {
    fields: [questionAttempts.assessmentItemId],
    references: [assessmentItems.id],
  }),
  student: one(users, { fields: [questionAttempts.studentId], references: [users.id] }),
}));
