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
  createdAt,
  mappingRoleEnum,
  primaryKeyId,
  questionTypeEnum,
  questionVersionStatusEnum,
  reviewDecisionEnum,
  updatedAt,
} from "./_shared.js";
import { users } from "./identity.js";
import { skills, subskills, taxonomyVersions } from "./taxonomy.js";

/**
 * Question bank.
 *
 * `questions` is the stable logical identity; `question_versions` is the content
 * a student actually saw at a point in time. A published version is never
 * edited in a way that erases history (DOMAIN_MODEL.md §3) — that rule is
 * enforced in the application layer, since "no destructive update" cannot be
 * expressed as a column constraint.
 */

export const questions = pgTable(
  "questions",
  {
    id: primaryKeyId(),
    stableCode: text("stable_code").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [uniqueIndex("questions_stable_code_unique").on(table.stableCode)],
);

export const questionVersions = pgTable(
  "question_versions",
  {
    id: primaryKeyId(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "restrict" }),
    versionNumber: integer("version_number").notNull(),
    status: questionVersionStatusEnum("status").notNull().default("DRAFT"),
    questionType: questionTypeEnum("question_type").notNull(),
    /** Structured rich content, not raw HTML — sanitisation happens on the way in. */
    stemContent: jsonb("stem_content").notNull(),
    explanationContent: jsonb("explanation_content"),
    /** ADAPTIVE_ENGINE.md §4 — normalised 0..1. */
    difficultyAuthorScore: numeric("difficulty_author_score", { precision: 4, scale: 3 }).notNull(),
    /** Kept separate from the author score; populated by future calibration. */
    difficultyMeasuredScore: numeric("difficulty_measured_score", { precision: 4, scale: 3 }),
    sourceType: text("source_type"),
    sourceReference: text("source_reference"),
    taxonomyVersionId: uuid("taxonomy_version_id")
      .notNull()
      .references(() => taxonomyVersions.id, { onDelete: "restrict" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    publishedAt: timestamp("published_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    // Also serves question_id lookups (leading column).
    uniqueIndex("question_versions_question_version_unique").on(
      table.questionId,
      table.versionNumber,
    ),
    // ERD.md indexing: candidate lookup filters on status + taxonomy.
    index("question_versions_status_taxonomy_idx").on(table.status, table.taxonomyVersionId),
    // OPEN_QUESTIONS.md #16c: at most one version in progress and one live
    // version per question. Enforced here so concurrent requests cannot both win.
    uniqueIndex("question_versions_one_in_progress")
      .on(table.questionId)
      .where(sql`status IN ('DRAFT', 'UNDER_REVIEW', 'APPROVED')`),
    uniqueIndex("question_versions_one_published")
      .on(table.questionId)
      .where(sql`status = 'PUBLISHED'`),
    index("question_versions_difficulty_idx").on(table.difficultyAuthorScore),
    check(
      "question_versions_author_difficulty_range",
      sql`${table.difficultyAuthorScore} >= 0 AND ${table.difficultyAuthorScore} <= 1`,
    ),
    check(
      "question_versions_measured_difficulty_range",
      sql`${table.difficultyMeasuredScore} IS NULL OR (${table.difficultyMeasuredScore} >= 0 AND ${table.difficultyMeasuredScore} <= 1)`,
    ),
    check("question_versions_version_number_positive", sql`${table.versionNumber} >= 1`),
  ],
);

/**
 * SECURITY.md — `is_correct` must never reach the student before they answer.
 * The column exists here; redaction is the API layer's responsibility and is
 * covered by the answer-redaction tests in IMPLEMENTATION_PLAN.md Phase 1.
 */
export const questionOptions = pgTable(
  "question_options",
  {
    id: primaryKeyId(),
    questionVersionId: uuid("question_version_id")
      .notNull()
      .references(() => questionVersions.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    content: jsonb("content").notNull(),
    isCorrect: boolean("is_correct").notNull().default(false),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("question_options_version_key_unique").on(table.questionVersionId, table.key),
    index("question_options_version_order_idx").on(table.questionVersionId, table.displayOrder),
  ],
);

/**
 * ERD.md — "Exactly one learning target reference per mapping row."
 * Enforced by CHECK, because a mapping pointing at both or neither node would
 * silently corrupt mastery attribution.
 */
export const questionSkillMappings = pgTable(
  "question_skill_mappings",
  {
    id: primaryKeyId(),
    questionVersionId: uuid("question_version_id")
      .notNull()
      .references(() => questionVersions.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id").references(() => skills.id, { onDelete: "restrict" }),
    subskillId: uuid("subskill_id").references(() => subskills.id, { onDelete: "restrict" }),
    role: mappingRoleEnum("role").notNull(),
    /** DOMAIN_MODEL.md §6 — PRIMARY 1.00 / SECONDARY 0.35 are config defaults. */
    attributionWeight: numeric("attribution_weight", { precision: 5, scale: 4 }).notNull(),
    rationale: text("rationale"),
    createdAt: createdAt(),
  },
  (table) => [
    index("question_skill_mappings_version_idx").on(table.questionVersionId),
    index("question_skill_mappings_skill_idx").on(table.skillId),
    index("question_skill_mappings_subskill_idx").on(table.subskillId),
    // A given version maps a given node at most once.
    uniqueIndex("question_skill_mappings_version_skill_unique")
      .on(table.questionVersionId, table.skillId)
      .where(sql`skill_id IS NOT NULL`),
    uniqueIndex("question_skill_mappings_version_subskill_unique")
      .on(table.questionVersionId, table.subskillId)
      .where(sql`subskill_id IS NOT NULL`),
    check(
      "question_skill_mappings_exactly_one_node",
      sql`(${table.skillId} IS NOT NULL)::int + (${table.subskillId} IS NOT NULL)::int = 1`,
    ),
    check(
      "question_skill_mappings_attribution_range",
      sql`${table.attributionWeight} > 0 AND ${table.attributionWeight} <= 1`,
    ),
  ],
);

export const contentReviews = pgTable(
  "content_reviews",
  {
    id: primaryKeyId(),
    questionVersionId: uuid("question_version_id")
      .notNull()
      .references(() => questionVersions.id, { onDelete: "cascade" }),
    reviewerId: uuid("reviewer_id").references(() => users.id, { onDelete: "set null" }),
    decision: reviewDecisionEnum("decision").notNull(),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (table) => [
    index("content_reviews_version_idx").on(table.questionVersionId),
    index("content_reviews_reviewer_idx").on(table.reviewerId),
  ],
);

/* -------------------------------------------------------------------------- */

export const questionsRelations = relations(questions, ({ one, many }) => ({
  createdByUser: one(users, { fields: [questions.createdBy], references: [users.id] }),
  versions: many(questionVersions),
}));

export const questionVersionsRelations = relations(questionVersions, ({ one, many }) => ({
  question: one(questions, { fields: [questionVersions.questionId], references: [questions.id] }),
  taxonomyVersion: one(taxonomyVersions, {
    fields: [questionVersions.taxonomyVersionId],
    references: [taxonomyVersions.id],
  }),
  options: many(questionOptions),
  mappings: many(questionSkillMappings),
  reviews: many(contentReviews),
}));

export const questionOptionsRelations = relations(questionOptions, ({ one }) => ({
  questionVersion: one(questionVersions, {
    fields: [questionOptions.questionVersionId],
    references: [questionVersions.id],
  }),
}));

export const questionSkillMappingsRelations = relations(questionSkillMappings, ({ one }) => ({
  questionVersion: one(questionVersions, {
    fields: [questionSkillMappings.questionVersionId],
    references: [questionVersions.id],
  }),
  skill: one(skills, { fields: [questionSkillMappings.skillId], references: [skills.id] }),
  subskill: one(subskills, {
    fields: [questionSkillMappings.subskillId],
    references: [subskills.id],
  }),
}));

export const contentReviewsRelations = relations(contentReviews, ({ one }) => ({
  questionVersion: one(questionVersions, {
    fields: [contentReviews.questionVersionId],
    references: [questionVersions.id],
  }),
  reviewer: one(users, { fields: [contentReviews.reviewerId], references: [users.id] }),
}));
