import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  createdAt,
  entitlementSourceEnum,
  entitlementStatusEnum,
  paymentStatusEnum,
  planStatusEnum,
  primaryKeyId,
  updatedAt,
} from "./_shared.js";
import { users } from "./identity.js";
import { exams } from "./taxonomy.js";

/**
 * Billing.
 *
 * DOMAIN_MODEL.md §3 — "نفس payment event لا يمنح entitlement مرتين" and
 * "webhook replay لا يكرر grant". Both reduce to uniqueness: a payment carries a
 * unique idempotency key, and an entitlement granted by a payment is unique on
 * its source reference.
 *
 * Money is stored in minor units as an integer. Never a float.
 */

export const plans = pgTable(
  "plans",
  {
    id: primaryKeyId(),
    examId: uuid("exam_id")
      .notNull()
      .references(() => exams.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    priceMinor: integer("price_minor").notNull(),
    currency: text("currency").notNull(),
    durationDays: integer("duration_days"),
    status: planStatusEnum("status").notNull().default("DRAFT"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("plans_code_unique").on(table.code),
    index("plans_exam_status_idx").on(table.examId, table.status),
    check("plans_price_non_negative", sql`${table.priceMinor} >= 0`),
    check(
      "plans_duration_positive",
      sql`${table.durationDays} IS NULL OR ${table.durationDays} > 0`,
    ),
    // ISO 4217 alphabetic code.
    check("plans_currency_format", sql`${table.currency} ~ '^[A-Z]{3}$'`),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: primaryKeyId(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "restrict" }),
    provider: text("provider").notNull(),
    providerReference: text("provider_reference"),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    status: paymentStatusEnum("status").notNull().default("PENDING"),
    idempotencyKey: text("idempotency_key").notNull(),
    /** SECURITY.md — redacted payload only. No card data, no provider secrets. */
    providerPayloadRedacted: jsonb("provider_payload_redacted"),
    createdAt: createdAt(),
    paidAt: timestamp("paid_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    uniqueIndex("payments_idempotency_key_unique").on(table.idempotencyKey),
    uniqueIndex("payments_provider_reference_unique")
      .on(table.provider, table.providerReference)
      .where(sql`provider_reference IS NOT NULL`),
    index("payments_student_status_idx").on(table.studentId, table.status),
    check("payments_amount_non_negative", sql`${table.amountMinor} >= 0`),
    check("payments_currency_format", sql`${table.currency} ~ '^[A-Z]{3}$'`),
  ],
);

export const entitlements = pgTable(
  "entitlements",
  {
    id: primaryKeyId(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    planId: uuid("plan_id").references(() => plans.id, { onDelete: "restrict" }),
    examId: uuid("exam_id")
      .notNull()
      .references(() => exams.id, { onDelete: "restrict" }),
    source: entitlementSourceEnum("source").notNull(),
    /** Payment id, admin action id or promo code — scoped by `source`. */
    sourceReference: text("source_reference"),
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }),
    status: entitlementStatusEnum("status").notNull().default("ACTIVE"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    /**
     * Replay guard: one entitlement per (source, reference) pair. A webhook
     * delivered twice cannot grant access twice.
     */
    uniqueIndex("entitlements_source_reference_unique")
      .on(table.source, table.sourceReference)
      .where(sql`source_reference IS NOT NULL`),
    // ERD.md indexing: entitlements by student/exam/status.
    index("entitlements_student_exam_status_idx").on(table.studentId, table.examId, table.status),
    check(
      "entitlements_period_valid",
      sql`${table.endsAt} IS NULL OR ${table.endsAt} > ${table.startsAt}`,
    ),
  ],
);

/* -------------------------------------------------------------------------- */

export const plansRelations = relations(plans, ({ one, many }) => ({
  exam: one(exams, { fields: [plans.examId], references: [exams.id] }),
  payments: many(payments),
  entitlements: many(entitlements),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  student: one(users, { fields: [payments.studentId], references: [users.id] }),
  plan: one(plans, { fields: [payments.planId], references: [plans.id] }),
}));

export const entitlementsRelations = relations(entitlements, ({ one }) => ({
  student: one(users, { fields: [entitlements.studentId], references: [users.id] }),
  plan: one(plans, { fields: [entitlements.planId], references: [plans.id] }),
  exam: one(exams, { fields: [entitlements.examId], references: [exams.id] }),
}));
