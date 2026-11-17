-- 0020_ai_knowledge_and_chat
--
-- AI (C3 follow-up): the knowledge library admins fill per exam (model questions and reference
-- texts), its retrieval chunks with an Arabic full-text vector kept by the database (RAG), and the
-- study chat's stored conversation. New tables, no backfill.

CREATE TYPE "public"."ai_chat_role" AS ENUM('STUDENT', 'ASSISTANT');--> statement-breakpoint
CREATE TYPE "public"."ai_knowledge_kind" AS ENUM('EXAMPLE', 'REFERENCE');--> statement-breakpoint
CREATE TABLE "ai_chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"exam_id" uuid NOT NULL,
	"role" "ai_chat_role" NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_chat_messages_content_length" CHECK (char_length("ai_chat_messages"."content") BETWEEN 1 AND 4000)
);
--> statement-breakpoint
CREATE TABLE "ai_knowledge_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"content" text NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector('arabic', content)) STORED NOT NULL,
	CONSTRAINT "ai_knowledge_chunks_position_non_negative" CHECK ("ai_knowledge_chunks"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ai_knowledge_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_id" uuid NOT NULL,
	"skill_id" uuid,
	"kind" "ai_knowledge_kind" NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "ai_knowledge_items_title_length" CHECK (char_length("ai_knowledge_items"."title") BETWEEN 1 AND 200),
	CONSTRAINT "ai_knowledge_items_content_length" CHECK (char_length("ai_knowledge_items"."content") BETWEEN 1 AND 20000)
);
--> statement-breakpoint
ALTER TABLE "ai_chat_messages" ADD CONSTRAINT "ai_chat_messages_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_chat_messages" ADD CONSTRAINT "ai_chat_messages_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_knowledge_chunks" ADD CONSTRAINT "ai_knowledge_chunks_item_id_ai_knowledge_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."ai_knowledge_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_knowledge_items" ADD CONSTRAINT "ai_knowledge_items_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_knowledge_items" ADD CONSTRAINT "ai_knowledge_items_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_knowledge_items" ADD CONSTRAINT "ai_knowledge_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_chat_messages_conversation_idx" ON "ai_chat_messages" USING btree ("student_id","exam_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_knowledge_chunks_item_idx" ON "ai_knowledge_chunks" USING btree ("item_id","position");--> statement-breakpoint
CREATE INDEX "ai_knowledge_chunks_search_idx" ON "ai_knowledge_chunks" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "ai_knowledge_items_exam_idx" ON "ai_knowledge_items" USING btree ("exam_id","archived_at","created_at");