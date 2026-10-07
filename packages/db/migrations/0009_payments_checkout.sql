-- 0009 payments_checkout
-- Review: additive only. Two nullable columns on payments (the provider's hosted
-- checkout page and when it expires) and a partial unique index allowing one
-- PENDING payment per student and plan (OPEN_QUESTIONS.md #5a: no double pay).
-- Data compatibility: existing rows keep NULL in both columns; the index can
-- only fail if a student already has two PENDING payments for one plan.
ALTER TABLE "payments" ADD COLUMN "checkout_url" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "checkout_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_one_pending" ON "payments" USING btree ("student_id","plan_id") WHERE status = 'PENDING';