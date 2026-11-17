import { sql } from "drizzle-orm";
import {
  check,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import {
  aiChatRoleEnum,
  aiKnowledgeKindEnum,
  aiRunStatusEnum,
  createdAt,
  primaryKeyId,
} from "./_shared.js";
import { users } from "./identity.js";
import { exams, skills } from "./taxonomy.js";

/** PostgreSQL full-text search vector; written by the database, never by the app. */
const tsvector = customType<{ data: string }>({
  dataType: () => "tsvector",
});

/**
 * AI (AI_INTEGRATION.md "Observability"): one row per AI run, whatever its
 * outcome. Never the prompt or any key; `output` only for validated output.
 */
export const aiRuns = pgTable(
  "ai_runs",
  {
    id: primaryKeyId(),
    task: text("task").notNull(),
    promptVersion: text("prompt_version").notNull(),
    schemaVersion: text("schema_version").notNull(),
    provider: text("provider").notNull(),
    model: text("model"),
    status: aiRunStatusEnum("status").notNull(),
    attempts: integer("attempts").notNull(),
    latencyMs: integer("latency_ms").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    errorCode: text("error_code"),
    requestedBy: uuid("requested_by").references(() => users.id, { onDelete: "set null" }),
    /** What the run was about, e.g. `question_version` and its id. */
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    output: jsonb("output"),
    createdAt: createdAt(),
  },
  (table) => [
    index("ai_runs_created_idx").on(table.createdAt),
    index("ai_runs_subject_idx").on(table.subjectType, table.subjectId),
    index("ai_runs_requested_by_idx").on(table.requestedBy, table.createdAt),
    check("ai_runs_counts_non_negative", sql`${table.attempts} >= 0 AND ${table.latencyMs} >= 0`),
    check(
      "ai_runs_output_only_on_success",
      sql`${table.output} IS NULL OR ${table.status} = 'SUCCEEDED'`,
    ),
  ],
);

/**
 * The knowledge library (AI_INTEGRATION.md "Knowledge Library"): model
 * questions and reference texts an admin adds for an exam. Question
 * generation follows the style of its EXAMPLE entries; the study chat is
 * grounded on what retrieval finds in its chunks (RAG).
 */
export const aiKnowledgeItems = pgTable(
  "ai_knowledge_items",
  {
    id: primaryKeyId(),
    examId: uuid("exam_id")
      .notNull()
      .references(() => exams.id, { onDelete: "cascade" }),
    /** Narrows an entry to one skill; null means the whole exam. */
    skillId: uuid("skill_id").references(() => skills.id, { onDelete: "set null" }),
    kind: aiKnowledgeKindEnum("kind").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    /** Archived entries are kept for the audit trail and never retrieved. */
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    index("ai_knowledge_items_exam_idx").on(table.examId, table.archivedAt, table.createdAt),
    check("ai_knowledge_items_title_length", sql`char_length(${table.title}) BETWEEN 1 AND 200`),
    check(
      "ai_knowledge_items_content_length",
      sql`char_length(${table.content}) BETWEEN 1 AND 20000`,
    ),
  ],
);

/**
 * Retrieval units of a library entry: short passages with an Arabic
 * full-text vector the database keeps in step with the text.
 */
export const aiKnowledgeChunks = pgTable(
  "ai_knowledge_chunks",
  {
    id: primaryKeyId(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => aiKnowledgeItems.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    content: text("content").notNull(),
    searchVector: tsvector("search_vector")
      .notNull()
      .generatedAlwaysAs(sql`to_tsvector('arabic', content)`),
  },
  (table) => [
    index("ai_knowledge_chunks_item_idx").on(table.itemId, table.position),
    index("ai_knowledge_chunks_search_idx").using("gin", table.searchVector),
    check("ai_knowledge_chunks_position_non_negative", sql`${table.position} >= 0`),
  ],
);

/**
 * The study chat's conversation, per student and exam. Kept so a reply is
 * grounded on what was really said, not on history a client sends.
 */
export const aiChatMessages = pgTable(
  "ai_chat_messages",
  {
    id: primaryKeyId(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    examId: uuid("exam_id")
      .notNull()
      .references(() => exams.id, { onDelete: "cascade" }),
    role: aiChatRoleEnum("role").notNull(),
    content: text("content").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("ai_chat_messages_conversation_idx").on(table.studentId, table.examId, table.createdAt),
    check("ai_chat_messages_content_length", sql`char_length(${table.content}) BETWEEN 1 AND 4000`),
  ],
);
