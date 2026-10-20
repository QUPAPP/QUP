import { sql } from "drizzle-orm";
import { pgEnum, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Shared column builders and enums.
 *
 * Enums are real PostgreSQL enum types, not free text: the state machines in
 * DOMAIN_MODEL.md §4 and ADAPTIVE_ENGINE.md §12 are business rules, and the
 * database is the last place they can be enforced.
 *
 * All timestamps are `timestamptz` and stored in UTC (AGENTS.md §7).
 */

export const primaryKeyId = () => uuid("id").primaryKey().defaultRandom();

/**
 * Predicate for a partial unique index on a nullable column: many rows may hold
 * NULL, but any present value must be unique.
 */
export const whereNotNull = (column: string) => sql.raw(`"${column}" IS NOT NULL`);

export const createdAt = () =>
  timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow();

/**
 * Maintained by the `qup_set_updated_at` trigger (migration 0001), so it stays
 * correct for raw SQL and scripts too — not only for writes made through the ORM.
 */
export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow();

/* -------------------------------------------------------------------------- */
/* Identity                                                                    */
/* -------------------------------------------------------------------------- */

export const userStatusEnum = pgEnum("user_status", [
  "PENDING_VERIFICATION",
  "ACTIVE",
  "SUSPENDED",
  "DEACTIVATED",
]);

/* -------------------------------------------------------------------------- */
/* Catalog / taxonomy                                                          */
/* -------------------------------------------------------------------------- */

export const examStatusEnum = pgEnum("exam_status", ["DRAFT", "ACTIVE", "ARCHIVED"]);

/** DOMAIN_MODEL.md §5 — taxonomy versions are retained historically. */
export const taxonomyVersionStatusEnum = pgEnum("taxonomy_version_status", [
  "DRAFT",
  "PUBLISHED",
  "ARCHIVED",
]);

/** Archived nodes stay referenceable; they are never deleted. */
export const taxonomyNodeStatusEnum = pgEnum("taxonomy_node_status", [
  "DRAFT",
  "ACTIVE",
  "ARCHIVED",
]);

/* -------------------------------------------------------------------------- */
/* Question bank                                                               */
/* -------------------------------------------------------------------------- */

/** DOMAIN_MODEL.md §4 — Question Version state machine. */
export const questionVersionStatusEnum = pgEnum("question_version_status", [
  "DRAFT",
  "UNDER_REVIEW",
  "APPROVED",
  "PUBLISHED",
  "ARCHIVED",
]);

export const questionTypeEnum = pgEnum("question_type", [
  "SINGLE_CHOICE",
  "MULTIPLE_CHOICE",
  "TRUE_FALSE",
  "NUMERIC",
  "SHORT_ANSWER",
]);

/** DOMAIN_MODEL.md §6 — PRIMARY = 1.00, SECONDARY = 0.35 by default. */
export const mappingRoleEnum = pgEnum("mapping_role", ["PRIMARY", "SECONDARY"]);

export const reviewDecisionEnum = pgEnum("review_decision", [
  "APPROVED",
  "REJECTED",
  "CHANGES_REQUESTED",
]);

/* -------------------------------------------------------------------------- */
/* Imports                                                                     */
/* -------------------------------------------------------------------------- */

/** DOMAIN_MODEL.md §4 — Import Batch state machine. */
export const importBatchStatusEnum = pgEnum("import_batch_status", [
  "UPLOADED",
  "QUEUED",
  "PARSING",
  "VALIDATING",
  "READY_FOR_REVIEW",
  "COMPLETED",
  "PARTIALLY_FAILED",
  "FAILED",
]);

export const importItemStatusEnum = pgEnum("import_item_status", [
  "PENDING",
  "VALID",
  "INVALID",
  "DUPLICATE",
  "IMPORTED",
  "SKIPPED",
]);

/* -------------------------------------------------------------------------- */
/* Assessment                                                                  */
/* -------------------------------------------------------------------------- */

/** PRD §12 — assessment types the architecture supports. */
export const blueprintTypeEnum = pgEnum("blueprint_type", [
  "MINI_DIAGNOSTIC",
  "FULL_DIAGNOSTIC",
  "PRACTICE",
  "ADAPTIVE_TRAINING",
  "SKILL_REASSESSMENT",
  "FULL_REASSESSMENT",
  "MOCK_EXAM",
]);

export const blueprintStatusEnum = pgEnum("blueprint_status", ["DRAFT", "ACTIVE", "ARCHIVED"]);

/** DOMAIN_MODEL.md §4 — Assessment Session state machine. */
export const assessmentSessionStatusEnum = pgEnum("assessment_session_status", [
  "CREATED",
  "IN_PROGRESS",
  "COMPLETED",
  "ABANDONED",
  "EXPIRED",
]);

export const itemSelectedByEnum = pgEnum("item_selected_by", ["ADAPTIVE", "BLUEPRINT", "FIXED"]);

/** ADAPTIVE_ENGINE.md §10 — SKIP yields no evidence in V1; TIMEOUT is damped. */
export const attemptResultTypeEnum = pgEnum("attempt_result_type", [
  "ANSWERED",
  "SKIPPED",
  "TIMEOUT",
]);

/* -------------------------------------------------------------------------- */
/* Mastery                                                                     */
/* -------------------------------------------------------------------------- */

/** ADAPTIVE_ENGINE.md §12 — mastery state machine. */
export const masteryStateEnum = pgEnum("mastery_state", [
  "UNASSESSED",
  "UNCERTAIN",
  "GAP",
  "DEVELOPING",
  "READY_FOR_REASSESSMENT",
  "MASTERED",
]);

/* -------------------------------------------------------------------------- */
/* Adaptive                                                                    */
/* -------------------------------------------------------------------------- */

export const adaptiveSessionStatusEnum = pgEnum("adaptive_session_status", [
  "ACTIVE",
  "COMPLETED",
  "ABANDONED",
]);

/* -------------------------------------------------------------------------- */
/* Billing                                                                     */
/* -------------------------------------------------------------------------- */

export const planStatusEnum = pgEnum("plan_status", ["DRAFT", "ACTIVE", "RETIRED"]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "PENDING",
  "SUCCEEDED",
  "FAILED",
  "REFUNDED",
  "CANCELLED",
]);

/** ERD.md — entitlements may be granted by payment, admin action or promotion. */
export const entitlementSourceEnum = pgEnum("entitlement_source", ["PAYMENT", "ADMIN", "PROMO"]);

export const entitlementStatusEnum = pgEnum("entitlement_status", ["ACTIVE", "EXPIRED", "REVOKED"]);

/* -------------------------------------------------------------------------- */
/* Operations                                                                  */
/* -------------------------------------------------------------------------- */

export const outboxStatusEnum = pgEnum("outbox_status", [
  "PENDING",
  "PROCESSING",
  "PUBLISHED",
  "FAILED",
]);

export const settingValueTypeEnum = pgEnum("setting_value_type", [
  "STRING",
  "NUMBER",
  "BOOLEAN",
  "JSON",
]);

/* -------------------------------------------------------------------------- */
/* AI                                                                          */
/* -------------------------------------------------------------------------- */

/** How one AI run ended (AI_INTEGRATION.md "Fallback"); mirrors @qup/ai-gateway. */
export const aiRunStatusEnum = pgEnum("ai_run_status", [
  "SUCCEEDED",
  "INVALID_OUTPUT",
  "TIMED_OUT",
  "FAILED",
]);
