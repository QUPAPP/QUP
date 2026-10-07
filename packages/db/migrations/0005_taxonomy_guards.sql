-- 0005_taxonomy_guards
--
-- A published taxonomy version is read-only (OPEN_QUESTIONS.md #16b). Question
-- versions and assessments point at taxonomy_version_id; if a published
-- version's domains, skills, weights or prerequisites could change afterwards,
-- historical results would silently change meaning (WORKFLOWS.md §9:
-- "Historical assessments keep old version references").
--
-- Purely additive: functions and triggers only.
-- Guard violations raise SQLSTATE 23001 (restrict_violation), like 0001.

-------------------------------------------------------------------------------
-- Ownership: which taxonomy version does a node belong to?
-------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION qup_taxonomy_version_of_domain(p_domain_id uuid) RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT taxonomy_version_id FROM domains WHERE id = p_domain_id
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION qup_taxonomy_version_of_skill(p_skill_id uuid) RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT d.taxonomy_version_id FROM skills s JOIN domains d ON d.id = s.domain_id WHERE s.id = p_skill_id
$$;
--> statement-breakpoint

-- Raises unless the version is DRAFT. A version that no longer exists (a row
-- being removed by an ON DELETE CASCADE from its draft parent) is allowed.
CREATE OR REPLACE FUNCTION qup_assert_taxonomy_draft(p_version_id uuid, p_operation text, p_table text)
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_status taxonomy_version_status;
BEGIN
  IF p_version_id IS NULL THEN
    RETURN;
  END IF;
  SELECT status INTO v_status FROM taxonomy_versions WHERE id = p_version_id;
  IF v_status IS NOT NULL AND v_status <> 'DRAFT' THEN
    RAISE EXCEPTION '% on "%" is not allowed: taxonomy version % is %; create a new version',
      p_operation, p_table, p_version_id, v_status
      USING ERRCODE = 'restrict_violation';
  END IF;
END;
$$;
--> statement-breakpoint

-------------------------------------------------------------------------------
-- Node tables: writable only while their version is DRAFT
-- (both the old and the new owner are checked, so a node can be neither moved
-- out of nor into a frozen version)
-------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION qup_domains_freeze() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM qup_assert_taxonomy_draft(OLD.taxonomy_version_id, TG_OP, TG_TABLE_NAME);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM qup_assert_taxonomy_draft(NEW.taxonomy_version_id, TG_OP, TG_TABLE_NAME);
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER domains_freeze BEFORE INSERT OR UPDATE OR DELETE ON domains FOR EACH ROW EXECUTE FUNCTION qup_domains_freeze();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION qup_skills_freeze() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM qup_assert_taxonomy_draft(qup_taxonomy_version_of_domain(OLD.domain_id), TG_OP, TG_TABLE_NAME);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM qup_assert_taxonomy_draft(qup_taxonomy_version_of_domain(NEW.domain_id), TG_OP, TG_TABLE_NAME);
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER skills_freeze BEFORE INSERT OR UPDATE OR DELETE ON skills FOR EACH ROW EXECUTE FUNCTION qup_skills_freeze();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION qup_subskills_freeze() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM qup_assert_taxonomy_draft(qup_taxonomy_version_of_skill(OLD.skill_id), TG_OP, TG_TABLE_NAME);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM qup_assert_taxonomy_draft(qup_taxonomy_version_of_skill(NEW.skill_id), TG_OP, TG_TABLE_NAME);
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER subskills_freeze BEFORE INSERT OR UPDATE OR DELETE ON subskills FOR EACH ROW EXECUTE FUNCTION qup_subskills_freeze();
--> statement-breakpoint

-- Prerequisites additionally must stay within one version: a skill in v2
-- depending on a skill in v1 would tie two taxonomies together.
CREATE OR REPLACE FUNCTION qup_skill_prerequisites_freeze() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_version uuid;
  v_prerequisite_version uuid;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM qup_assert_taxonomy_draft(qup_taxonomy_version_of_skill(OLD.skill_id), TG_OP, TG_TABLE_NAME);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_version := qup_taxonomy_version_of_skill(NEW.skill_id);
    v_prerequisite_version := qup_taxonomy_version_of_skill(NEW.prerequisite_skill_id);
    IF v_version IS DISTINCT FROM v_prerequisite_version THEN
      RAISE EXCEPTION 'prerequisite skill % belongs to a different taxonomy version', NEW.prerequisite_skill_id
        USING ERRCODE = 'check_violation';
    END IF;
    PERFORM qup_assert_taxonomy_draft(v_version, TG_OP, TG_TABLE_NAME);
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER skill_prerequisites_freeze BEFORE INSERT OR UPDATE OR DELETE ON skill_prerequisites FOR EACH ROW EXECUTE FUNCTION qup_skill_prerequisites_freeze();
--> statement-breakpoint

-------------------------------------------------------------------------------
-- Taxonomy versions: forward-only lifecycle, identity frozen once published
--   DRAFT → PUBLISHED → ARCHIVED   (DOMAIN_MODEL.md / ERD.md status values)
-------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION qup_taxonomy_versions_lifecycle() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'taxonomy version % is %: it cannot be deleted', OLD.id, OLD.status
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF (OLD.status = 'PUBLISHED' AND NEW.status NOT IN ('PUBLISHED', 'ARCHIVED'))
     OR (OLD.status = 'ARCHIVED' AND NEW.status <> 'ARCHIVED') THEN
    RAISE EXCEPTION 'taxonomy version % cannot move from % to %', OLD.id, OLD.status, NEW.status
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF OLD.status <> 'DRAFT' AND (
       NEW.exam_id        IS DISTINCT FROM OLD.exam_id
    OR NEW.version_code   IS DISTINCT FROM OLD.version_code
    OR NEW.effective_from IS DISTINCT FROM OLD.effective_from) THEN
    RAISE EXCEPTION 'taxonomy version % is %: its identity is frozen', OLD.id, OLD.status
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER taxonomy_versions_lifecycle BEFORE UPDATE OR DELETE ON taxonomy_versions FOR EACH ROW EXECUTE FUNCTION qup_taxonomy_versions_lifecycle();
