import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  createdAt,
  examStatusEnum,
  primaryKeyId,
  taxonomyNodeStatusEnum,
  taxonomyVersionStatusEnum,
  updatedAt,
} from "./_shared.js";
import { users } from "./identity.js";

/**
 * Exam catalog & taxonomy.
 *
 * Canonical hierarchy: Exam → Domain → Skill → SubSkill (DOMAIN_MODEL.md §5).
 * SubSkill is optional; measurement happens at the smallest measurable node.
 *
 * No behaviour is ever keyed off an exam's name or code (AGENTS.md §3).
 */

export const exams = pgTable(
  "exams",
  {
    id: primaryKeyId(),
    code: text("code").notNull(),
    slug: text("slug").notNull(),
    nameAr: text("name_ar").notNull(),
    nameEn: text("name_en"),
    description: text("description"),
    status: examStatusEnum("status").notNull().default("DRAFT"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("exams_code_unique").on(table.code),
    uniqueIndex("exams_slug_unique").on(table.slug),
    index("exams_status_idx").on(table.status),
  ],
);

export const taxonomyVersions = pgTable(
  "taxonomy_versions",
  {
    id: primaryKeyId(),
    examId: uuid("exam_id")
      .notNull()
      .references(() => exams.id, { onDelete: "restrict" }),
    versionCode: text("version_code").notNull(),
    status: taxonomyVersionStatusEnum("status").notNull().default("DRAFT"),
    effectiveFrom: timestamp("effective_from", { withTimezone: true, mode: "date" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    // ERD.md — one version code per exam.
    uniqueIndex("taxonomy_versions_exam_version_unique").on(table.examId, table.versionCode),
    index("taxonomy_versions_exam_status_idx").on(table.examId, table.status),
  ],
);

export const domains = pgTable(
  "domains",
  {
    id: primaryKeyId(),
    taxonomyVersionId: uuid("taxonomy_version_id")
      .notNull()
      .references(() => taxonomyVersions.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    weight: numeric("weight", { precision: 6, scale: 4 }).notNull().default("1.0000"),
    displayOrder: integer("display_order").notNull().default(0),
    status: taxonomyNodeStatusEnum("status").notNull().default("ACTIVE"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("domains_version_code_unique").on(table.taxonomyVersionId, table.code),
    index("domains_version_order_idx").on(table.taxonomyVersionId, table.displayOrder),
  ],
);

export const skills = pgTable(
  "skills",
  {
    id: primaryKeyId(),
    domainId: uuid("domain_id")
      .notNull()
      .references(() => domains.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    weight: numeric("weight", { precision: 6, scale: 4 }).notNull().default("1.0000"),
    /** Null → fall back to the versioned config default (ADAPTIVE_ENGINE.md §12). */
    masteryThreshold: numeric("mastery_threshold", { precision: 4, scale: 3 }),
    priorityWeight: numeric("priority_weight", { precision: 6, scale: 4 })
      .notNull()
      .default("1.0000"),
    minCoverage: integer("min_coverage").notNull().default(0),
    displayOrder: integer("display_order").notNull().default(0),
    status: taxonomyNodeStatusEnum("status").notNull().default("ACTIVE"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("skills_domain_code_unique").on(table.domainId, table.code),
    index("skills_domain_order_idx").on(table.domainId, table.displayOrder),
    check(
      "skills_mastery_threshold_range",
      sql`${table.masteryThreshold} IS NULL OR (${table.masteryThreshold} > 0 AND ${table.masteryThreshold} <= 1)`,
    ),
  ],
);

export const subskills = pgTable(
  "subskills",
  {
    id: primaryKeyId(),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    weight: numeric("weight", { precision: 6, scale: 4 }).notNull().default("1.0000"),
    masteryThreshold: numeric("mastery_threshold", { precision: 4, scale: 3 }),
    displayOrder: integer("display_order").notNull().default(0),
    status: taxonomyNodeStatusEnum("status").notNull().default("ACTIVE"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("subskills_skill_code_unique").on(table.skillId, table.code),
    index("subskills_skill_order_idx").on(table.skillId, table.displayOrder),
    check(
      "subskills_mastery_threshold_range",
      sql`${table.masteryThreshold} IS NULL OR (${table.masteryThreshold} > 0 AND ${table.masteryThreshold} <= 1)`,
    ),
  ],
);

/**
 * ERD.md — "No self/cycles."
 *
 * The self-reference case is cheap to enforce here. Full cycle detection is a
 * graph problem and belongs in the application layer (IMPLEMENTATION_PLAN.md
 * Phase 1: "prerequisite cycle prevention" tests).
 */
export const skillPrerequisites = pgTable(
  "skill_prerequisites",
  {
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    prerequisiteSkillId: uuid("prerequisite_skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    importanceWeight: numeric("importance_weight", { precision: 6, scale: 4 })
      .notNull()
      .default("1.0000"),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.skillId, table.prerequisiteSkillId] }),
    index("skill_prerequisites_prerequisite_idx").on(table.prerequisiteSkillId),
    check("skill_prerequisites_no_self", sql`${table.skillId} <> ${table.prerequisiteSkillId}`),
  ],
);

/* -------------------------------------------------------------------------- */

export const examsRelations = relations(exams, ({ many }) => ({
  taxonomyVersions: many(taxonomyVersions),
}));

export const taxonomyVersionsRelations = relations(taxonomyVersions, ({ one, many }) => ({
  exam: one(exams, { fields: [taxonomyVersions.examId], references: [exams.id] }),
  createdByUser: one(users, { fields: [taxonomyVersions.createdBy], references: [users.id] }),
  domains: many(domains),
}));

export const domainsRelations = relations(domains, ({ one, many }) => ({
  taxonomyVersion: one(taxonomyVersions, {
    fields: [domains.taxonomyVersionId],
    references: [taxonomyVersions.id],
  }),
  skills: many(skills),
}));

export const skillsRelations = relations(skills, ({ one, many }) => ({
  domain: one(domains, { fields: [skills.domainId], references: [domains.id] }),
  subskills: many(subskills),
}));

export const subskillsRelations = relations(subskills, ({ one }) => ({
  skill: one(skills, { fields: [subskills.skillId], references: [skills.id] }),
}));
