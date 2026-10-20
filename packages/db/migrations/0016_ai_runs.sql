-- 0016_ai_runs
--
-- AI gateway (C3): one row per AI run with its versions, outcome, latency and tokens. Never the
-- prompt; output only for validated successes. New table, no backfill.

CREATE TYPE "public"."ai_run_status" AS ENUM('SUCCEEDED', 'INVALID_OUTPUT', 'TIMED_OUT', 'FAILED');--> statement-breakpoint
CREATE TABLE "ai_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task" text NOT NULL,
	"prompt_version" text NOT NULL,
	"schema_version" text NOT NULL,
	"provider" text NOT NULL,
	"model" text,
	"status" "ai_run_status" NOT NULL,
	"attempts" integer NOT NULL,
	"latency_ms" integer NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"error_code" text,
	"requested_by" uuid,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"output" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_runs_counts_non_negative" CHECK ("ai_runs"."attempts" >= 0 AND "ai_runs"."latency_ms" >= 0),
	CONSTRAINT "ai_runs_output_only_on_success" CHECK ("ai_runs"."output" IS NULL OR "ai_runs"."status" = 'SUCCEEDED')
);
--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_runs_created_idx" ON "ai_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_runs_subject_idx" ON "ai_runs" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "ai_runs_requested_by_idx" ON "ai_runs" USING btree ("requested_by","created_at");