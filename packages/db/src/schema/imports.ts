import { relations } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { createdAt, importBatchStatusEnum, importItemStatusEnum, primaryKeyId } from "./_shared.js";
import { users } from "./identity.js";
import { questions, questionVersions } from "./questions.js";
import { taxonomyVersions } from "./taxonomy.js";

/**
 * Content import.
 *
 * SECURITY.md — uploads go to private storage under a random key; `object_key`
 * is that opaque key, never a user-supplied filesystem path.
 */

export const importBatches = pgTable(
  "import_batches",
  {
    id: primaryKeyId(),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    originalFilename: text("original_filename").notNull(),
    detectedType: text("detected_type"),
    objectKey: text("object_key").notNull(),
    status: importBatchStatusEnum("status").notNull().default("UPLOADED"),
    parserVersion: text("parser_version"),
    /** The file's column names, in order (structured imports, A3). */
    headers: jsonb("headers"),
    /** The column chosen for each question field at the last processing. */
    columnMapping: jsonb("column_mapping"),
    /** The taxonomy version rows were matched against, and drafts are written for. */
    taxonomyVersionId: uuid("taxonomy_version_id").references(() => taxonomyVersions.id, {
      onDelete: "restrict",
    }),
    totals: jsonb("totals"),
    createdAt: createdAt(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    index("import_batches_status_idx").on(table.status),
    index("import_batches_uploaded_by_idx").on(table.uploadedBy),
  ],
);

export const importItems = pgTable(
  "import_items",
  {
    id: primaryKeyId(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => importBatches.id, { onDelete: "cascade" }),
    sourceLocator: text("source_locator"),
    normalizedPayload: jsonb("normalized_payload"),
    validationErrors: jsonb("validation_errors"),
    duplicateOfQuestionId: uuid("duplicate_of_question_id").references(() => questions.id, {
      onDelete: "set null",
    }),
    status: importItemStatusEnum("status").notNull().default("PENDING"),
    resultingQuestionVersionId: uuid("resulting_question_version_id").references(
      () => questionVersions.id,
      { onDelete: "set null" },
    ),
    createdAt: createdAt(),
  },
  (table) => [
    // ERD.md indexing: import items by batch/status.
    index("import_items_batch_status_idx").on(table.batchId, table.status),
  ],
);

/* -------------------------------------------------------------------------- */

export const importBatchesRelations = relations(importBatches, ({ one, many }) => ({
  uploadedByUser: one(users, { fields: [importBatches.uploadedBy], references: [users.id] }),
  items: many(importItems),
}));

export const importItemsRelations = relations(importItems, ({ one }) => ({
  batch: one(importBatches, { fields: [importItems.batchId], references: [importBatches.id] }),
  duplicateOf: one(questions, {
    fields: [importItems.duplicateOfQuestionId],
    references: [questions.id],
  }),
  resultingQuestionVersion: one(questionVersions, {
    fields: [importItems.resultingQuestionVersionId],
    references: [questionVersions.id],
  }),
}));
