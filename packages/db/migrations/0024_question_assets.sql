CREATE TABLE "question_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"sha256" text NOT NULL,
	"storage_key" text NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_assets_kind_known" CHECK ("question_assets"."kind" IN ('IMAGE', 'AUDIO')),
	CONSTRAINT "question_assets_size_positive" CHECK ("question_assets"."byte_size" > 0),
	CONSTRAINT "question_assets_sha256_hex" CHECK ("question_assets"."sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "question_assets" ADD CONSTRAINT "question_assets_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "question_assets_sha256_unique" ON "question_assets" USING btree ("sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "question_assets_storage_key_unique" ON "question_assets" USING btree ("storage_key");