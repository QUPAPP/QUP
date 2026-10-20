-- 0015_import_batch_mapping
--
-- Structured import (A3): a batch keeps its column names, the mapping chosen for them and the
-- taxonomy version its rows were matched against. Additive, nullable, no backfill.

ALTER TABLE "import_batches" ADD COLUMN "headers" jsonb;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "column_mapping" jsonb;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "taxonomy_version_id" uuid;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_taxonomy_version_id_taxonomy_versions_id_fk" FOREIGN KEY ("taxonomy_version_id") REFERENCES "public"."taxonomy_versions"("id") ON DELETE restrict ON UPDATE no action;