ALTER TABLE "users" ALTER COLUMN "password_hash" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_has_identifier" CHECK ("users"."email" IS NOT NULL OR "users"."phone" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_normalized" CHECK ("users"."email" = lower(btrim("users"."email")));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_phone_e164" CHECK ("users"."phone" ~ '^\+[1-9][0-9]{7,14}$');