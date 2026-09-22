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
  outboxStatusEnum,
  primaryKeyId,
  settingValueTypeEnum,
  updatedAt,
} from "./_shared.js";
import { users } from "./identity.js";

/**
 * Operations: audit, analytics stream, transactional outbox, settings.
 */

/** SECURITY.md — metadata is redacted before it is written here. */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: primaryKeyId(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    requestId: text("request_id"),
    metadataRedacted: jsonb("metadata_redacted"),
    createdAt: createdAt(),
  },
  (table) => [
    index("audit_logs_actor_created_idx").on(table.actorId, table.createdAt),
    index("audit_logs_resource_idx").on(table.resourceType, table.resourceId),
    index("audit_logs_created_idx").on(table.createdAt),
  ],
);

/** Append-only analytics stream; `schema_version` allows the payload to evolve. */
export const learningEvents = pgTable(
  "learning_events",
  {
    id: primaryKeyId(),
    studentId: uuid("student_id").references(() => users.id, { onDelete: "set null" }),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    schemaVersion: text("schema_version").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("learning_events_student_occurred_idx").on(table.studentId, table.occurredAt),
    index("learning_events_type_occurred_idx").on(table.eventType, table.occurredAt),
  ],
);

/**
 * ARCHITECTURE.md §10 — written inside the same transaction as the business
 * change, then drained by a worker.
 */
export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: primaryKeyId(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: text("aggregate_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    status: outboxStatusEnum("status").notNull().default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    availableAt: timestamp("available_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
  },
  (table) => [
    // Worker claim query: pending rows whose backoff has elapsed, oldest first.
    index("outbox_events_status_available_idx").on(table.status, table.availableAt),
    index("outbox_events_aggregate_idx").on(table.aggregateType, table.aggregateId),
    check("outbox_events_attempts_non_negative", sql`${table.attempts} >= 0`),
  ],
);

/**
 * ERD.md — "versioned typed settings; critical rules should not hide in
 * arbitrary JSON". Hence an explicit value type rather than a bare jsonb blob.
 */
export const systemSettings = pgTable(
  "system_settings",
  {
    id: primaryKeyId(),
    key: text("key").notNull(),
    valueType: settingValueTypeEnum("value_type").notNull(),
    value: jsonb("value").notNull(),
    version: integer("version").notNull().default(1),
    description: text("description"),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("system_settings_key_version_unique").on(table.key, table.version),
    check("system_settings_version_positive", sql`${table.version} >= 1`),
  ],
);

/* -------------------------------------------------------------------------- */

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  actor: one(users, { fields: [auditLogs.actorId], references: [users.id] }),
}));

export const learningEventsRelations = relations(learningEvents, ({ one }) => ({
  student: one(users, { fields: [learningEvents.studentId], references: [users.id] }),
}));

export const systemSettingsRelations = relations(systemSettings, ({ one }) => ({
  updatedByUser: one(users, { fields: [systemSettings.updatedBy], references: [users.id] }),
}));
