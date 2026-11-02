CREATE TYPE "public"."question_report_reason" AS ENUM('WRONG_ANSWER', 'UNCLEAR_QUESTION', 'TYPO', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."question_report_status" AS ENUM('OPEN', 'RESOLVED', 'DISMISSED');--> statement-breakpoint
CREATE TABLE "question_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"question_version_id" uuid NOT NULL,
	"reported_by" uuid NOT NULL,
	"reason" "question_report_reason" NOT NULL,
	"note" text,
	"status" "question_report_status" DEFAULT 'OPEN' NOT NULL,
	"resolution_note" text,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_reports_note_length" CHECK (char_length("question_reports"."note") <= 1000),
	CONSTRAINT "question_reports_resolution_consistent" CHECK (("question_reports"."status" = 'OPEN') = ("question_reports"."resolved_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "question_reports" ADD CONSTRAINT "question_reports_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_reports" ADD CONSTRAINT "question_reports_question_version_id_question_versions_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_reports" ADD CONSTRAINT "question_reports_reported_by_users_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_reports" ADD CONSTRAINT "question_reports_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "question_reports_status_idx" ON "question_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "question_reports_question_idx" ON "question_reports" USING btree ("question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "question_reports_one_open_per_student" ON "question_reports" USING btree ("reported_by","question_version_id") WHERE "question_reports"."status" = 'OPEN';