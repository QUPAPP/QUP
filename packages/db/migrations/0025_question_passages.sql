CREATE TABLE "question_passages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"content" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_passages_title_length" CHECK (char_length("question_passages"."title") BETWEEN 1 AND 200)
);
--> statement-breakpoint
ALTER TABLE "question_versions" ADD COLUMN "passage_id" uuid;--> statement-breakpoint
ALTER TABLE "question_passages" ADD CONSTRAINT "question_passages_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "question_passages_created_idx" ON "question_passages" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_passage_id_question_passages_id_fk" FOREIGN KEY ("passage_id") REFERENCES "public"."question_passages"("id") ON DELETE restrict ON UPDATE no action;