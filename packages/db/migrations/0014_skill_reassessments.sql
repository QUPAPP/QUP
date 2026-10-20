-- 0014_skill_reassessments
--
-- Skill reassessment (B4): one outcome row per reassessment session (a pass makes the skill
-- MASTERED; the latest failure holds it), and the skill a SKILL_REASSESSMENT session checks.
-- Additive: a new table and a nullable column, no backfill.

CREATE TABLE "skill_reassessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"exam_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"passed" boolean NOT NULL,
	"correct" integer NOT NULL,
	"total" integer NOT NULL,
	"required_correct" integer NOT NULL,
	"mastery_after" numeric(6, 5),
	"config_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skill_reassessments_counts" CHECK ("skill_reassessments"."total" >= 1 AND "skill_reassessments"."correct" >= 0 AND "skill_reassessments"."correct" <= "skill_reassessments"."total")
);
--> statement-breakpoint
ALTER TABLE "assessment_sessions" ADD COLUMN "target_skill_id" uuid;--> statement-breakpoint
ALTER TABLE "skill_reassessments" ADD CONSTRAINT "skill_reassessments_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_reassessments" ADD CONSTRAINT "skill_reassessments_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_reassessments" ADD CONSTRAINT "skill_reassessments_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_reassessments" ADD CONSTRAINT "skill_reassessments_session_id_assessment_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."assessment_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "skill_reassessments_session_unique" ON "skill_reassessments" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "skill_reassessments_student_skill_idx" ON "skill_reassessments" USING btree ("student_id","exam_id","skill_id","created_at");--> statement-breakpoint
ALTER TABLE "assessment_sessions" ADD CONSTRAINT "assessment_sessions_target_skill_id_skills_id_fk" FOREIGN KEY ("target_skill_id") REFERENCES "public"."skills"("id") ON DELETE restrict ON UPDATE no action;