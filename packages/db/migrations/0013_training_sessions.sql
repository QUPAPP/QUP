-- 0013_training_sessions
--
-- Adaptive training (B3) chooses items one at a time, so a session records how many it ends at.
-- NULL keeps the diagnostics' meaning: every item was planned up front. Additive, no backfill.

ALTER TABLE "assessment_sessions" ADD COLUMN "planned_item_count" integer;--> statement-breakpoint
ALTER TABLE "assessment_sessions" ADD CONSTRAINT "assessment_sessions_planned_item_count_positive" CHECK ("assessment_sessions"."planned_item_count" IS NULL OR "assessment_sessions"."planned_item_count" >= 1);