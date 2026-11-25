ALTER TABLE "users" DROP CONSTRAINT "users_has_identifier";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "terms_version" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "terms_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "erased_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_erased_has_no_identifier" CHECK ("users"."erased_at" IS NULL OR ("users"."email" IS NULL AND "users"."phone" IS NULL AND "users"."status" = 'DEACTIVATED'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_terms_recorded_together" CHECK (("users"."terms_version" IS NULL) = ("users"."terms_accepted_at" IS NULL));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_has_identifier" CHECK ("users"."email" IS NOT NULL OR "users"."phone" IS NOT NULL OR "users"."erased_at" IS NOT NULL);