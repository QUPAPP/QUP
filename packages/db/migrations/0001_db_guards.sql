-- 0001_db_guards
--
-- Database-level guards for invariants that DOMAIN_MODEL.md, ADAPTIVE_ENGINE.md
-- and SECURITY.md state but that column constraints cannot express. The
-- application enforces these too; this is the layer that still holds when a
-- bug, a script or a manual query bypasses the application.
--
-- Purely additive: creates functions and triggers only. No table, column or
-- row is altered or removed.
--
-- All guard violations raise SQLSTATE 23001 (restrict_violation).

-------------------------------------------------------------------------------
-- 1. updated_at is maintained by the database, not only by the ORM
-------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION qup_set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION qup_set_updated_at();
--> statement-breakpoint
CREATE TRIGGER roles_set_updated_at BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION qup_set_updated_at();
--> statement-breakpoint
CREATE TRIGGER exams_set_updated_at BEFORE UPDATE ON exams FOR EACH ROW EXECUTE FUNCTION qup_set_updated_at();
--> statement-breakpoint
CREATE TRIGGER taxonomy_versions_set_updated_at BEFORE UPDATE ON taxonomy_versions FOR EACH ROW EXECUTE FUNCTION qup_set_updated_at();
--> statement-breakpoint
CREATE TRIGGER domains_set_updated_at BEFORE UPDATE ON domains FOR EACH ROW EXECUTE FUNCTION qup_set_updated_at();
--> statement-breakpoint
CREATE TRIGGER skills_set_updated_at BEFORE UPDATE ON skills FOR EACH ROW EXECUTE FUNCTION qup_set_updated_at();
--> statement-breakpoint
CREATE TRIGGER subskills_set_updated_at BEFORE UPDATE ON subskills FOR EACH ROW EXECUTE FUNCTION qup_set_updated_at();
--> statement-breakpoint
CREATE TRIGGER question_versions_set_updated_at BEFORE UPDATE ON question_versions FOR EACH ROW EXECUTE FUNCTION qup_set_updated_at();
--> statement-breakpoint
CREATE TRIGGER assessment_blueprints_set_updated_at BEFORE UPDATE ON assessment_blueprints FOR EACH ROW EXECUTE FUNCTION qup_set_updated_at();
--> statement-breakpoint
CREATE TRIGGER assessment_sessions_set_updated_at BEFORE UPDATE ON assessment_sessions FOR EACH ROW EXECUTE FUNCTION qup_set_updated_at();
--> statement-breakpoint
CREATE TRIGGER student_mastery_states_set_updated_at BEFORE UPDATE ON student_mastery_states FOR EACH ROW EXECUTE FUNCTION qup_set_updated_at();
--> statement-breakpoint
CREATE TRIGGER plans_set_updated_at BEFORE UPDATE ON plans FOR EACH ROW EXECUTE FUNCTION qup_set_updated_at();
--> statement-breakpoint
CREATE TRIGGER entitlements_set_updated_at BEFORE UPDATE ON entitlements FOR EACH ROW EXECUTE FUNCTION qup_set_updated_at();
--> statement-breakpoint
CREATE TRIGGER system_settings_set_updated_at BEFORE UPDATE ON system_settings FOR EACH ROW EXECUTE FUNCTION qup_set_updated_at();
--> statement-breakpoint

-------------------------------------------------------------------------------
-- 2. Append-only ledgers
--
-- DOMAIN_MODEL.md §3 — "MasteryEvent immutable".
-- SECURITY.md / OBSERVABILITY.md — audit is a durable security record.
-- Row triggers do not fire on TRUNCATE, so each table also gets a
-- statement-level TRUNCATE guard.
-------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION qup_reject_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'table "%" is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER mastery_events_append_only BEFORE UPDATE OR DELETE ON mastery_events FOR EACH ROW EXECUTE FUNCTION qup_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER mastery_events_no_truncate BEFORE TRUNCATE ON mastery_events FOR EACH STATEMENT EXECUTE FUNCTION qup_reject_mutation();
--> statement-breakpoint

-- audit_logs.actor_id is ON DELETE SET NULL. A strictly append-only guard would
-- turn every user deletion into an opaque failure, so exactly one change is
-- permitted: detaching the actor with every other column unchanged. This also
-- keeps personal-data erasure possible without destroying the audit record.
CREATE OR REPLACE FUNCTION qup_audit_logs_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.actor_id IS NULL
       AND (to_jsonb(NEW) - 'actor_id') = (to_jsonb(OLD) - 'actor_id') THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'table "audit_logs" is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION qup_audit_logs_guard();
--> statement-breakpoint
CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON audit_logs FOR EACH STATEMENT EXECUTE FUNCTION qup_reject_mutation();
--> statement-breakpoint

-------------------------------------------------------------------------------
-- 3. Published question content is frozen
--
-- DOMAIN_MODEL.md §3 — "Published Question Version لا يتم تعديلها بما يمحو
-- التاريخ". An attempt points at an exact question_version_id; if that
-- version's stem, options or correct answer could change afterwards, the
-- attempt would no longer mean what it meant when it was graded.
--
-- Still allowed on a published version: archiving it, and recording a
-- calibrated difficulty_measured_score (kept separate from the author score
-- precisely so it can evolve — ADAPTIVE_ENGINE.md §4).
-------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION qup_question_version_freeze() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('PUBLISHED', 'ARCHIVED') THEN
      RAISE EXCEPTION 'question version % is %: it cannot be deleted', OLD.id, OLD.status
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status NOT IN ('PUBLISHED', 'ARCHIVED') THEN
    RETURN NEW;
  END IF;

  -- The state machine only moves forward: PUBLISHED → ARCHIVED, never back.
  IF (OLD.status = 'PUBLISHED' AND NEW.status NOT IN ('PUBLISHED', 'ARCHIVED'))
     OR (OLD.status = 'ARCHIVED' AND NEW.status <> 'ARCHIVED') THEN
    RAISE EXCEPTION 'question version % cannot move from % to %', OLD.id, OLD.status, NEW.status
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW.question_id             IS DISTINCT FROM OLD.question_id
  OR NEW.version_number          IS DISTINCT FROM OLD.version_number
  OR NEW.question_type           IS DISTINCT FROM OLD.question_type
  OR NEW.stem_content            IS DISTINCT FROM OLD.stem_content
  OR NEW.explanation_content     IS DISTINCT FROM OLD.explanation_content
  OR NEW.difficulty_author_score IS DISTINCT FROM OLD.difficulty_author_score
  OR NEW.taxonomy_version_id     IS DISTINCT FROM OLD.taxonomy_version_id
  OR NEW.source_type             IS DISTINCT FROM OLD.source_type
  OR NEW.source_reference        IS DISTINCT FROM OLD.source_reference
  OR NEW.published_at            IS DISTINCT FROM OLD.published_at THEN
    RAISE EXCEPTION 'question version % is %: its content is frozen, create a new version', OLD.id, OLD.status
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER question_versions_freeze BEFORE UPDATE OR DELETE ON question_versions FOR EACH ROW EXECUTE FUNCTION qup_question_version_freeze();
--> statement-breakpoint

-- Options and mappings belong to the version's content: changing a published
-- version's correct option or its skill mapping rewrites history just as
-- surely as editing its stem. Both the old and the new parent are checked so a
-- row cannot be moved out of, or into, a frozen version.
CREATE OR REPLACE FUNCTION qup_question_child_freeze() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  old_parent uuid;
  new_parent uuid;
  frozen_parent uuid;
BEGIN
  -- OLD is NULL on INSERT and NEW is NULL on DELETE; read each only when set.
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    old_parent := OLD.question_version_id;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    new_parent := NEW.question_version_id;
  END IF;

  SELECT qv.id INTO frozen_parent
  FROM question_versions qv
  WHERE qv.status IN ('PUBLISHED', 'ARCHIVED')
    AND qv.id IN (old_parent, new_parent)
  LIMIT 1;

  IF frozen_parent IS NOT NULL THEN
    RAISE EXCEPTION '% on "%" is not allowed: question version % is published or archived', TG_OP, TG_TABLE_NAME, frozen_parent
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER question_options_freeze BEFORE INSERT OR UPDATE OR DELETE ON question_options FOR EACH ROW EXECUTE FUNCTION qup_question_child_freeze();
--> statement-breakpoint
CREATE TRIGGER question_skill_mappings_freeze BEFORE INSERT OR UPDATE OR DELETE ON question_skill_mappings FOR EACH ROW EXECUTE FUNCTION qup_question_child_freeze();
