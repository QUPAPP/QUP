CREATE TYPE "public"."adaptive_session_status" AS ENUM('ACTIVE', 'COMPLETED', 'ABANDONED');--> statement-breakpoint
CREATE TYPE "public"."assessment_session_status" AS ENUM('CREATED', 'IN_PROGRESS', 'COMPLETED', 'ABANDONED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."attempt_result_type" AS ENUM('ANSWERED', 'SKIPPED', 'TIMEOUT');--> statement-breakpoint
CREATE TYPE "public"."blueprint_status" AS ENUM('DRAFT', 'ACTIVE', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."blueprint_type" AS ENUM('DIAGNOSTIC', 'PRACTICE', 'REASSESSMENT', 'MOCK_EXAM');--> statement-breakpoint
CREATE TYPE "public"."entitlement_source" AS ENUM('PAYMENT', 'ADMIN', 'PROMO');--> statement-breakpoint
CREATE TYPE "public"."entitlement_status" AS ENUM('ACTIVE', 'EXPIRED', 'REVOKED');--> statement-breakpoint
CREATE TYPE "public"."exam_status" AS ENUM('DRAFT', 'ACTIVE', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."import_batch_status" AS ENUM('UPLOADED', 'QUEUED', 'PARSING', 'VALIDATING', 'READY_FOR_REVIEW', 'COMPLETED', 'PARTIALLY_FAILED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."import_item_status" AS ENUM('PENDING', 'VALID', 'INVALID', 'DUPLICATE', 'IMPORTED', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."item_selected_by" AS ENUM('ADAPTIVE', 'BLUEPRINT', 'FIXED');--> statement-breakpoint
CREATE TYPE "public"."mapping_role" AS ENUM('PRIMARY', 'SECONDARY');--> statement-breakpoint
CREATE TYPE "public"."mastery_state" AS ENUM('UNASSESSED', 'UNCERTAIN', 'GAP', 'DEVELOPING', 'READY_FOR_REASSESSMENT', 'MASTERED');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('DRAFT', 'ACTIVE', 'RETIRED');--> statement-breakpoint
CREATE TYPE "public"."question_type" AS ENUM('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'NUMERIC', 'SHORT_ANSWER');--> statement-breakpoint
CREATE TYPE "public"."question_version_status" AS ENUM('DRAFT', 'UNDER_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."review_decision" AS ENUM('APPROVED', 'REJECTED', 'CHANGES_REQUESTED');--> statement-breakpoint
CREATE TYPE "public"."setting_value_type" AS ENUM('STRING', 'NUMBER', 'BOOLEAN', 'JSON');--> statement-breakpoint
CREATE TYPE "public"."taxonomy_node_status" AS ENUM('DRAFT', 'ACTIVE', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."taxonomy_version_status" AS ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED');--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"user_agent" text,
	"ip_address" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"granted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"phone" text,
	"password_hash" text,
	"display_name" text,
	"status" "user_status" DEFAULT 'PENDING_VERIFICATION' NOT NULL,
	"email_verified_at" timestamp with time zone,
	"phone_verified_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"taxonomy_version_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"weight" numeric(6, 4) DEFAULT '1.0000' NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"status" "taxonomy_node_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"slug" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text,
	"description" text,
	"status" "exam_status" DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_prerequisites" (
	"skill_id" uuid NOT NULL,
	"prerequisite_skill_id" uuid NOT NULL,
	"importance_weight" numeric(6, 4) DEFAULT '1.0000' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skill_prerequisites_skill_id_prerequisite_skill_id_pk" PRIMARY KEY("skill_id","prerequisite_skill_id"),
	CONSTRAINT "skill_prerequisites_no_self" CHECK ("skill_prerequisites"."skill_id" <> "skill_prerequisites"."prerequisite_skill_id")
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"weight" numeric(6, 4) DEFAULT '1.0000' NOT NULL,
	"mastery_threshold" numeric(4, 3),
	"priority_weight" numeric(6, 4) DEFAULT '1.0000' NOT NULL,
	"min_coverage" integer DEFAULT 0 NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"status" "taxonomy_node_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skills_mastery_threshold_range" CHECK ("skills"."mastery_threshold" IS NULL OR ("skills"."mastery_threshold" > 0 AND "skills"."mastery_threshold" <= 1))
);
--> statement-breakpoint
CREATE TABLE "subskills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"skill_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"weight" numeric(6, 4) DEFAULT '1.0000' NOT NULL,
	"mastery_threshold" numeric(4, 3),
	"display_order" integer DEFAULT 0 NOT NULL,
	"status" "taxonomy_node_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subskills_mastery_threshold_range" CHECK ("subskills"."mastery_threshold" IS NULL OR ("subskills"."mastery_threshold" > 0 AND "subskills"."mastery_threshold" <= 1))
);
--> statement-breakpoint
CREATE TABLE "taxonomy_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_id" uuid NOT NULL,
	"version_code" text NOT NULL,
	"status" "taxonomy_version_status" DEFAULT 'DRAFT' NOT NULL,
	"effective_from" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_version_id" uuid NOT NULL,
	"reviewer_id" uuid,
	"decision" "review_decision" NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_version_id" uuid NOT NULL,
	"key" text NOT NULL,
	"content" jsonb NOT NULL,
	"is_correct" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_skill_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_version_id" uuid NOT NULL,
	"skill_id" uuid,
	"subskill_id" uuid,
	"role" "mapping_role" NOT NULL,
	"attribution_weight" numeric(5, 4) NOT NULL,
	"rationale" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_skill_mappings_exactly_one_node" CHECK (("question_skill_mappings"."skill_id" IS NOT NULL)::int + ("question_skill_mappings"."subskill_id" IS NOT NULL)::int = 1),
	CONSTRAINT "question_skill_mappings_attribution_range" CHECK ("question_skill_mappings"."attribution_weight" > 0 AND "question_skill_mappings"."attribution_weight" <= 1)
);
--> statement-breakpoint
CREATE TABLE "question_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"status" "question_version_status" DEFAULT 'DRAFT' NOT NULL,
	"question_type" "question_type" NOT NULL,
	"stem_content" jsonb NOT NULL,
	"explanation_content" jsonb,
	"difficulty_author_score" numeric(4, 3) NOT NULL,
	"difficulty_measured_score" numeric(4, 3),
	"source_type" text,
	"source_reference" text,
	"taxonomy_version_id" uuid NOT NULL,
	"created_by" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_versions_author_difficulty_range" CHECK ("question_versions"."difficulty_author_score" >= 0 AND "question_versions"."difficulty_author_score" <= 1),
	CONSTRAINT "question_versions_measured_difficulty_range" CHECK ("question_versions"."difficulty_measured_score" IS NULL OR ("question_versions"."difficulty_measured_score" >= 0 AND "question_versions"."difficulty_measured_score" <= 1)),
	CONSTRAINT "question_versions_version_number_positive" CHECK ("question_versions"."version_number" >= 1)
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stable_code" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"uploaded_by" uuid,
	"original_filename" text NOT NULL,
	"detected_type" text,
	"object_key" text NOT NULL,
	"status" "import_batch_status" DEFAULT 'UPLOADED' NOT NULL,
	"parser_version" text,
	"totals" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "import_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"source_locator" text,
	"normalized_payload" jsonb,
	"validation_errors" jsonb,
	"duplicate_of_question_id" uuid,
	"status" "import_item_status" DEFAULT 'PENDING' NOT NULL,
	"resulting_question_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_blueprints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_id" uuid NOT NULL,
	"taxonomy_version_id" uuid NOT NULL,
	"code" text NOT NULL,
	"type" "blueprint_type" NOT NULL,
	"name" text NOT NULL,
	"min_questions" integer NOT NULL,
	"max_questions" integer NOT NULL,
	"time_limit_seconds" integer,
	"status" "blueprint_status" DEFAULT 'DRAFT' NOT NULL,
	"config_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_blueprints_question_bounds" CHECK ("assessment_blueprints"."min_questions" >= 1 AND "assessment_blueprints"."max_questions" >= "assessment_blueprints"."min_questions")
);
--> statement-breakpoint
CREATE TABLE "assessment_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"question_version_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"selected_by" "item_selected_by" NOT NULL,
	"adaptive_decision_id" uuid,
	"presented_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_items_decision_only_when_adaptive" CHECK ("assessment_items"."adaptive_decision_id" IS NULL OR "assessment_items"."selected_by" = 'ADAPTIVE'),
	CONSTRAINT "assessment_items_ordinal_positive" CHECK ("assessment_items"."ordinal" >= 1)
);
--> statement-breakpoint
CREATE TABLE "assessment_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"blueprint_id" uuid,
	"type" "blueprint_type" NOT NULL,
	"status" "assessment_session_status" DEFAULT 'CREATED' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"scoring_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blueprint_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blueprint_id" uuid NOT NULL,
	"domain_id" uuid,
	"skill_id" uuid,
	"subskill_id" uuid,
	"min_count" integer,
	"max_count" integer,
	"target_weight" numeric(6, 4),
	"difficulty_min" numeric(4, 3),
	"difficulty_max" numeric(4, 3),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blueprint_rules_at_most_one_node" CHECK (("blueprint_rules"."domain_id" IS NOT NULL)::int + ("blueprint_rules"."skill_id" IS NOT NULL)::int + ("blueprint_rules"."subskill_id" IS NOT NULL)::int <= 1),
	CONSTRAINT "blueprint_rules_count_bounds" CHECK ("blueprint_rules"."min_count" IS NULL OR "blueprint_rules"."max_count" IS NULL OR "blueprint_rules"."max_count" >= "blueprint_rules"."min_count"),
	CONSTRAINT "blueprint_rules_difficulty_bounds" CHECK ("blueprint_rules"."difficulty_min" IS NULL OR "blueprint_rules"."difficulty_max" IS NULL OR "blueprint_rules"."difficulty_max" >= "blueprint_rules"."difficulty_min")
);
--> statement-breakpoint
CREATE TABLE "question_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_item_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"submitted_answer" jsonb,
	"is_correct" boolean,
	"result_type" "attempt_result_type" NOT NULL,
	"hint_used" boolean DEFAULT false NOT NULL,
	"answer_revealed" boolean DEFAULT false NOT NULL,
	"response_time_ms" integer,
	"finalized_at" timestamp with time zone,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_attempts_response_time_non_negative" CHECK ("question_attempts"."response_time_ms" IS NULL OR "question_attempts"."response_time_ms" >= 0),
	CONSTRAINT "question_attempts_correctness_matches_result" CHECK (("question_attempts"."result_type" = 'ANSWERED' AND "question_attempts"."is_correct" IS NOT NULL)
          OR ("question_attempts"."result_type" <> 'ANSWERED' AND "question_attempts"."is_correct" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "mastery_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"skill_id" uuid,
	"subskill_id" uuid,
	"before_mastery" numeric(6, 5) NOT NULL,
	"after_mastery" numeric(6, 5) NOT NULL,
	"before_confidence" numeric(6, 5) NOT NULL,
	"after_confidence" numeric(6, 5) NOT NULL,
	"positive_evidence" numeric(12, 6) DEFAULT '0.000000' NOT NULL,
	"negative_evidence" numeric(12, 6) DEFAULT '0.000000' NOT NULL,
	"reason_code" text NOT NULL,
	"difficulty" numeric(4, 3) NOT NULL,
	"attribution_weight" numeric(5, 4) NOT NULL,
	"algorithm_version" text NOT NULL,
	"config_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mastery_events_exactly_one_node" CHECK (("mastery_events"."skill_id" IS NOT NULL)::int + ("mastery_events"."subskill_id" IS NOT NULL)::int = 1),
	CONSTRAINT "mastery_events_evidence_non_negative" CHECK ("mastery_events"."positive_evidence" >= 0 AND "mastery_events"."negative_evidence" >= 0),
	CONSTRAINT "mastery_events_difficulty_range" CHECK ("mastery_events"."difficulty" >= 0 AND "mastery_events"."difficulty" <= 1)
);
--> statement-breakpoint
CREATE TABLE "student_mastery_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"exam_id" uuid NOT NULL,
	"skill_id" uuid,
	"subskill_id" uuid,
	"alpha" numeric(12, 6) DEFAULT '2.000000' NOT NULL,
	"beta" numeric(12, 6) DEFAULT '2.000000' NOT NULL,
	"mastery_score" numeric(6, 5) DEFAULT '0.50000' NOT NULL,
	"confidence_score" numeric(6, 5) DEFAULT '0.00000' NOT NULL,
	"evidence_count" integer DEFAULT 0 NOT NULL,
	"distinct_question_count" integer DEFAULT 0 NOT NULL,
	"coverage_score" numeric(6, 5) DEFAULT '0.00000' NOT NULL,
	"state" "mastery_state" DEFAULT 'UNASSESSED' NOT NULL,
	"algorithm_version" text NOT NULL,
	"config_version" text NOT NULL,
	"row_version" integer DEFAULT 0 NOT NULL,
	"last_evidence_at" timestamp with time zone,
	"last_reassessment_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_mastery_states_exactly_one_node" CHECK (("student_mastery_states"."skill_id" IS NOT NULL)::int + ("student_mastery_states"."subskill_id" IS NOT NULL)::int = 1),
	CONSTRAINT "student_mastery_states_scores_range" CHECK ("student_mastery_states"."mastery_score" >= 0 AND "student_mastery_states"."mastery_score" <= 1
          AND "student_mastery_states"."confidence_score" >= 0 AND "student_mastery_states"."confidence_score" <= 1
          AND "student_mastery_states"."coverage_score" >= 0 AND "student_mastery_states"."coverage_score" <= 1),
	CONSTRAINT "student_mastery_states_priors_positive" CHECK ("student_mastery_states"."alpha" > 0 AND "student_mastery_states"."beta" > 0),
	CONSTRAINT "student_mastery_states_counts_non_negative" CHECK ("student_mastery_states"."evidence_count" >= 0 AND "student_mastery_states"."distinct_question_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "adaptive_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"adaptive_session_id" uuid,
	"student_id" uuid NOT NULL,
	"target_skill_id" uuid,
	"target_subskill_id" uuid,
	"mastery_snapshot" numeric(6, 5),
	"confidence_snapshot" numeric(6, 5),
	"target_difficulty" numeric(4, 3),
	"candidate_snapshot" jsonb,
	"selected_question_version_id" uuid,
	"reason_codes" jsonb,
	"engine_version" text NOT NULL,
	"config_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "adaptive_decisions_exactly_one_target" CHECK (("adaptive_decisions"."target_skill_id" IS NOT NULL)::int + ("adaptive_decisions"."target_subskill_id" IS NOT NULL)::int = 1),
	CONSTRAINT "adaptive_decisions_target_difficulty_range" CHECK ("adaptive_decisions"."target_difficulty" IS NULL OR ("adaptive_decisions"."target_difficulty" >= 0 AND "adaptive_decisions"."target_difficulty" <= 1))
);
--> statement-breakpoint
CREATE TABLE "adaptive_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"exam_id" uuid NOT NULL,
	"target_skill_id" uuid,
	"target_subskill_id" uuid,
	"status" "adaptive_session_status" DEFAULT 'ACTIVE' NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "adaptive_sessions_at_most_one_target" CHECK (("adaptive_sessions"."target_skill_id" IS NOT NULL)::int + ("adaptive_sessions"."target_subskill_id" IS NOT NULL)::int <= 1)
);
--> statement-breakpoint
CREATE TABLE "entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"plan_id" uuid,
	"exam_id" uuid NOT NULL,
	"source" "entitlement_source" NOT NULL,
	"source_reference" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"status" "entitlement_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entitlements_period_valid" CHECK ("entitlements"."ends_at" IS NULL OR "entitlements"."ends_at" > "entitlements"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_reference" text,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"status" "payment_status" DEFAULT 'PENDING' NOT NULL,
	"idempotency_key" text NOT NULL,
	"provider_payload_redacted" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	CONSTRAINT "payments_amount_non_negative" CHECK ("payments"."amount_minor" >= 0),
	CONSTRAINT "payments_currency_format" CHECK ("payments"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"price_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"duration_days" integer,
	"status" "plan_status" DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_price_non_negative" CHECK ("plans"."price_minor" >= 0),
	CONSTRAINT "plans_duration_positive" CHECK ("plans"."duration_days" IS NULL OR "plans"."duration_days" > 0),
	CONSTRAINT "plans_currency_format" CHECK ("plans"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"request_id" text,
	"metadata_redacted" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"schema_version" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "outbox_status" DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_events_attempts_non_negative" CHECK ("outbox_events"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"value_type" "setting_value_type" NOT NULL,
	"value" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"description" text,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "system_settings_version_positive" CHECK ("system_settings"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_taxonomy_version_id_taxonomy_versions_id_fk" FOREIGN KEY ("taxonomy_version_id") REFERENCES "public"."taxonomy_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_prerequisites" ADD CONSTRAINT "skill_prerequisites_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_prerequisites" ADD CONSTRAINT "skill_prerequisites_prerequisite_skill_id_skills_id_fk" FOREIGN KEY ("prerequisite_skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subskills" ADD CONSTRAINT "subskills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxonomy_versions" ADD CONSTRAINT "taxonomy_versions_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxonomy_versions" ADD CONSTRAINT "taxonomy_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_reviews" ADD CONSTRAINT "content_reviews_question_version_id_question_versions_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_reviews" ADD CONSTRAINT "content_reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_question_version_id_question_versions_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_skill_mappings" ADD CONSTRAINT "question_skill_mappings_question_version_id_question_versions_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_skill_mappings" ADD CONSTRAINT "question_skill_mappings_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_skill_mappings" ADD CONSTRAINT "question_skill_mappings_subskill_id_subskills_id_fk" FOREIGN KEY ("subskill_id") REFERENCES "public"."subskills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_taxonomy_version_id_taxonomy_versions_id_fk" FOREIGN KEY ("taxonomy_version_id") REFERENCES "public"."taxonomy_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_items" ADD CONSTRAINT "import_items_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_items" ADD CONSTRAINT "import_items_duplicate_of_question_id_questions_id_fk" FOREIGN KEY ("duplicate_of_question_id") REFERENCES "public"."questions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_items" ADD CONSTRAINT "import_items_resulting_question_version_id_question_versions_id_fk" FOREIGN KEY ("resulting_question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_blueprints" ADD CONSTRAINT "assessment_blueprints_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_blueprints" ADD CONSTRAINT "assessment_blueprints_taxonomy_version_id_taxonomy_versions_id_fk" FOREIGN KEY ("taxonomy_version_id") REFERENCES "public"."taxonomy_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_items" ADD CONSTRAINT "assessment_items_session_id_assessment_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."assessment_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_items" ADD CONSTRAINT "assessment_items_question_version_id_question_versions_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_items" ADD CONSTRAINT "assessment_items_adaptive_decision_id_adaptive_decisions_id_fk" FOREIGN KEY ("adaptive_decision_id") REFERENCES "public"."adaptive_decisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_sessions" ADD CONSTRAINT "assessment_sessions_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_sessions" ADD CONSTRAINT "assessment_sessions_blueprint_id_assessment_blueprints_id_fk" FOREIGN KEY ("blueprint_id") REFERENCES "public"."assessment_blueprints"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blueprint_rules" ADD CONSTRAINT "blueprint_rules_blueprint_id_assessment_blueprints_id_fk" FOREIGN KEY ("blueprint_id") REFERENCES "public"."assessment_blueprints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blueprint_rules" ADD CONSTRAINT "blueprint_rules_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blueprint_rules" ADD CONSTRAINT "blueprint_rules_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blueprint_rules" ADD CONSTRAINT "blueprint_rules_subskill_id_subskills_id_fk" FOREIGN KEY ("subskill_id") REFERENCES "public"."subskills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_attempts" ADD CONSTRAINT "question_attempts_assessment_item_id_assessment_items_id_fk" FOREIGN KEY ("assessment_item_id") REFERENCES "public"."assessment_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_attempts" ADD CONSTRAINT "question_attempts_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mastery_events" ADD CONSTRAINT "mastery_events_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mastery_events" ADD CONSTRAINT "mastery_events_attempt_id_question_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."question_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mastery_events" ADD CONSTRAINT "mastery_events_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mastery_events" ADD CONSTRAINT "mastery_events_subskill_id_subskills_id_fk" FOREIGN KEY ("subskill_id") REFERENCES "public"."subskills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_mastery_states" ADD CONSTRAINT "student_mastery_states_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_mastery_states" ADD CONSTRAINT "student_mastery_states_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_mastery_states" ADD CONSTRAINT "student_mastery_states_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_mastery_states" ADD CONSTRAINT "student_mastery_states_subskill_id_subskills_id_fk" FOREIGN KEY ("subskill_id") REFERENCES "public"."subskills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adaptive_decisions" ADD CONSTRAINT "adaptive_decisions_adaptive_session_id_adaptive_sessions_id_fk" FOREIGN KEY ("adaptive_session_id") REFERENCES "public"."adaptive_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adaptive_decisions" ADD CONSTRAINT "adaptive_decisions_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adaptive_decisions" ADD CONSTRAINT "adaptive_decisions_target_skill_id_skills_id_fk" FOREIGN KEY ("target_skill_id") REFERENCES "public"."skills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adaptive_decisions" ADD CONSTRAINT "adaptive_decisions_target_subskill_id_subskills_id_fk" FOREIGN KEY ("target_subskill_id") REFERENCES "public"."subskills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adaptive_decisions" ADD CONSTRAINT "adaptive_decisions_selected_question_version_id_question_versions_id_fk" FOREIGN KEY ("selected_question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adaptive_sessions" ADD CONSTRAINT "adaptive_sessions_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adaptive_sessions" ADD CONSTRAINT "adaptive_sessions_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adaptive_sessions" ADD CONSTRAINT "adaptive_sessions_target_skill_id_skills_id_fk" FOREIGN KEY ("target_skill_id") REFERENCES "public"."skills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adaptive_sessions" ADD CONSTRAINT "adaptive_sessions_target_subskill_id_subskills_id_fk" FOREIGN KEY ("target_subskill_id") REFERENCES "public"."subskills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_events" ADD CONSTRAINT "learning_events_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_token_hash_unique" ON "auth_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_expires_idx" ON "auth_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "permissions_code_unique" ON "permissions" USING btree ("code");--> statement-breakpoint
CREATE INDEX "role_permissions_permission_idx" ON "role_permissions" USING btree ("permission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_code_unique" ON "roles" USING btree ("code");--> statement-breakpoint
CREATE INDEX "user_roles_role_idx" ON "user_roles" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email") WHERE "email" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_unique" ON "users" USING btree ("phone") WHERE "phone" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "domains_version_code_unique" ON "domains" USING btree ("taxonomy_version_id","code");--> statement-breakpoint
CREATE INDEX "domains_version_order_idx" ON "domains" USING btree ("taxonomy_version_id","display_order");--> statement-breakpoint
CREATE UNIQUE INDEX "exams_code_unique" ON "exams" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "exams_slug_unique" ON "exams" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "exams_status_idx" ON "exams" USING btree ("status");--> statement-breakpoint
CREATE INDEX "skill_prerequisites_prerequisite_idx" ON "skill_prerequisites" USING btree ("prerequisite_skill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "skills_domain_code_unique" ON "skills" USING btree ("domain_id","code");--> statement-breakpoint
CREATE INDEX "skills_domain_order_idx" ON "skills" USING btree ("domain_id","display_order");--> statement-breakpoint
CREATE UNIQUE INDEX "subskills_skill_code_unique" ON "subskills" USING btree ("skill_id","code");--> statement-breakpoint
CREATE INDEX "subskills_skill_order_idx" ON "subskills" USING btree ("skill_id","display_order");--> statement-breakpoint
CREATE UNIQUE INDEX "taxonomy_versions_exam_version_unique" ON "taxonomy_versions" USING btree ("exam_id","version_code");--> statement-breakpoint
CREATE INDEX "taxonomy_versions_exam_status_idx" ON "taxonomy_versions" USING btree ("exam_id","status");--> statement-breakpoint
CREATE INDEX "content_reviews_version_idx" ON "content_reviews" USING btree ("question_version_id");--> statement-breakpoint
CREATE INDEX "content_reviews_reviewer_idx" ON "content_reviews" USING btree ("reviewer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "question_options_version_key_unique" ON "question_options" USING btree ("question_version_id","key");--> statement-breakpoint
CREATE INDEX "question_options_version_order_idx" ON "question_options" USING btree ("question_version_id","display_order");--> statement-breakpoint
CREATE INDEX "question_skill_mappings_version_idx" ON "question_skill_mappings" USING btree ("question_version_id");--> statement-breakpoint
CREATE INDEX "question_skill_mappings_skill_idx" ON "question_skill_mappings" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "question_skill_mappings_subskill_idx" ON "question_skill_mappings" USING btree ("subskill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "question_skill_mappings_version_skill_unique" ON "question_skill_mappings" USING btree ("question_version_id","skill_id") WHERE skill_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "question_skill_mappings_version_subskill_unique" ON "question_skill_mappings" USING btree ("question_version_id","subskill_id") WHERE subskill_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "question_versions_question_version_unique" ON "question_versions" USING btree ("question_id","version_number");--> statement-breakpoint
CREATE INDEX "question_versions_status_taxonomy_idx" ON "question_versions" USING btree ("status","taxonomy_version_id");--> statement-breakpoint
CREATE INDEX "question_versions_difficulty_idx" ON "question_versions" USING btree ("difficulty_author_score");--> statement-breakpoint
CREATE UNIQUE INDEX "questions_stable_code_unique" ON "questions" USING btree ("stable_code");--> statement-breakpoint
CREATE INDEX "import_batches_status_idx" ON "import_batches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "import_batches_uploaded_by_idx" ON "import_batches" USING btree ("uploaded_by");--> statement-breakpoint
CREATE INDEX "import_items_batch_status_idx" ON "import_items" USING btree ("batch_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_blueprints_exam_code_unique" ON "assessment_blueprints" USING btree ("exam_id","code");--> statement-breakpoint
CREATE INDEX "assessment_blueprints_exam_type_status_idx" ON "assessment_blueprints" USING btree ("exam_id","type","status");--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_items_session_ordinal_unique" ON "assessment_items" USING btree ("session_id","ordinal");--> statement-breakpoint
CREATE INDEX "assessment_items_question_version_idx" ON "assessment_items" USING btree ("question_version_id");--> statement-breakpoint
CREATE INDEX "assessment_sessions_student_status_idx" ON "assessment_sessions" USING btree ("student_id","status");--> statement-breakpoint
CREATE INDEX "assessment_sessions_expires_idx" ON "assessment_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "blueprint_rules_blueprint_idx" ON "blueprint_rules" USING btree ("blueprint_id");--> statement-breakpoint
CREATE UNIQUE INDEX "question_attempts_item_unique" ON "question_attempts" USING btree ("assessment_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "question_attempts_idempotency_key_unique" ON "question_attempts" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "question_attempts_student_created_idx" ON "question_attempts" USING btree ("student_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mastery_events_attempt_node_unique" ON "mastery_events" USING btree ("attempt_id",COALESCE("skill_id", '00000000-0000-0000-0000-000000000000'::uuid),COALESCE("subskill_id", '00000000-0000-0000-0000-000000000000'::uuid));--> statement-breakpoint
CREATE INDEX "mastery_events_student_created_idx" ON "mastery_events" USING btree ("student_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "student_mastery_states_student_node_unique" ON "student_mastery_states" USING btree ("student_id",COALESCE("skill_id", '00000000-0000-0000-0000-000000000000'::uuid),COALESCE("subskill_id", '00000000-0000-0000-0000-000000000000'::uuid));--> statement-breakpoint
CREATE INDEX "student_mastery_states_student_exam_state_idx" ON "student_mastery_states" USING btree ("student_id","exam_id","state");--> statement-breakpoint
CREATE INDEX "adaptive_decisions_session_created_idx" ON "adaptive_decisions" USING btree ("adaptive_session_id","created_at");--> statement-breakpoint
CREATE INDEX "adaptive_decisions_student_created_idx" ON "adaptive_decisions" USING btree ("student_id","created_at");--> statement-breakpoint
CREATE INDEX "adaptive_sessions_student_status_idx" ON "adaptive_sessions" USING btree ("student_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "entitlements_source_reference_unique" ON "entitlements" USING btree ("source","source_reference") WHERE source_reference IS NOT NULL;--> statement-breakpoint
CREATE INDEX "entitlements_student_exam_status_idx" ON "entitlements" USING btree ("student_id","exam_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_idempotency_key_unique" ON "payments" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_reference_unique" ON "payments" USING btree ("provider","provider_reference") WHERE provider_reference IS NOT NULL;--> statement-breakpoint
CREATE INDEX "payments_student_status_idx" ON "payments" USING btree ("student_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "plans_code_unique" ON "plans" USING btree ("code");--> statement-breakpoint
CREATE INDEX "plans_exam_status_idx" ON "plans" USING btree ("exam_id","status");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_created_idx" ON "audit_logs" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_resource_idx" ON "audit_logs" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "learning_events_student_occurred_idx" ON "learning_events" USING btree ("student_id","occurred_at");--> statement-breakpoint
CREATE INDEX "learning_events_type_occurred_idx" ON "learning_events" USING btree ("event_type","occurred_at");--> statement-breakpoint
CREATE INDEX "outbox_events_status_available_idx" ON "outbox_events" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "outbox_events_aggregate_idx" ON "outbox_events" USING btree ("aggregate_type","aggregate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "system_settings_key_version_unique" ON "system_settings" USING btree ("key","version");