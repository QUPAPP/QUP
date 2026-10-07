-- 0007_question_lifecycle_guards
--
-- Tightens the question guards from 0001. There, content froze only once a
-- version was PUBLISHED, which left a gap: a version could be approved, then
-- edited, then published — content that nobody reviewed. Now:
--
--   * content (stem, options, answer key, mappings) is editable only in DRAFT;
--     sending a version back to DRAFT is the only way to change it, and it then
--     needs a new review (OPEN_QUESTIONS.md #16c);
--   * status follows the documented lifecycle (PRD §11, DOMAIN_MODEL.md §4):
--       DRAFT → UNDER_REVIEW → APPROVED → PUBLISHED → ARCHIVED
--       UNDER_REVIEW / APPROVED → DRAFT   (changes requested / sent back)
--       any non-archived → ARCHIVED
--   * publishing requires the DOMAIN_MODEL.md §3 invariants: a correct answer
--     and exactly one PRIMARY learning mapping;
--   * a mapping must point at a node of the version's own taxonomy.
--
-- Redefines two functions from 0001 (their triggers are unchanged) and adds one
-- function and one trigger. No table or row changes.
-- Violations raise 23001 (restrict_violation), or 23514 (check_violation) for
-- invalid content.

CREATE OR REPLACE FUNCTION qup_taxonomy_version_of_subskill(p_subskill_id uuid) RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT d.taxonomy_version_id
  FROM subskills ss
  JOIN skills s ON s.id = ss.skill_id
  JOIN domains d ON d.id = s.domain_id
  WHERE ss.id = p_subskill_id
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION qup_question_version_freeze() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_allowed boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Only a draft that never entered review may be removed.
    IF OLD.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'question version % is %: it cannot be deleted', OLD.id, OLD.status
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_allowed := CASE OLD.status
      WHEN 'DRAFT'        THEN NEW.status IN ('UNDER_REVIEW', 'ARCHIVED')
      WHEN 'UNDER_REVIEW' THEN NEW.status IN ('APPROVED', 'DRAFT', 'ARCHIVED')
      WHEN 'APPROVED'     THEN NEW.status IN ('PUBLISHED', 'DRAFT', 'ARCHIVED')
      WHEN 'PUBLISHED'    THEN NEW.status = 'ARCHIVED'
      ELSE false
    END;
    IF NOT v_allowed THEN
      RAISE EXCEPTION 'question version % cannot move from % to %', OLD.id, OLD.status, NEW.status
        USING ERRCODE = 'restrict_violation';
    END IF;

    IF NEW.status = 'PUBLISHED' THEN
      IF NOT EXISTS (
        SELECT 1 FROM question_options WHERE question_version_id = NEW.id AND is_correct
      ) THEN
        RAISE EXCEPTION 'question version % has no correct option', NEW.id
          USING ERRCODE = 'check_violation';
      END IF;
      IF (SELECT count(*) FROM question_skill_mappings
          WHERE question_version_id = NEW.id AND role = 'PRIMARY') <> 1 THEN
        RAISE EXCEPTION 'question version % must have exactly one PRIMARY mapping', NEW.id
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  -- published_at is written once, by the APPROVED → PUBLISHED transition.
  IF NEW.published_at IS DISTINCT FROM OLD.published_at
     AND NOT (OLD.status = 'APPROVED' AND NEW.status = 'PUBLISHED') THEN
    RAISE EXCEPTION 'published_at of question version % can only be set when publishing', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- Content is editable only in DRAFT. difficulty_measured_score stays
  -- writable in every status: calibration evolves separately (ADAPTIVE_ENGINE.md §4).
  IF OLD.status <> 'DRAFT' AND (
       NEW.question_id             IS DISTINCT FROM OLD.question_id
    OR NEW.version_number          IS DISTINCT FROM OLD.version_number
    OR NEW.question_type           IS DISTINCT FROM OLD.question_type
    OR NEW.stem_content            IS DISTINCT FROM OLD.stem_content
    OR NEW.explanation_content     IS DISTINCT FROM OLD.explanation_content
    OR NEW.difficulty_author_score IS DISTINCT FROM OLD.difficulty_author_score
    OR NEW.taxonomy_version_id     IS DISTINCT FROM OLD.taxonomy_version_id
    OR NEW.source_type             IS DISTINCT FROM OLD.source_type
    OR NEW.source_reference        IS DISTINCT FROM OLD.source_reference
    OR NEW.created_by              IS DISTINCT FROM OLD.created_by) THEN
    RAISE EXCEPTION 'question version % is %: its content can only change in DRAFT', OLD.id, OLD.status
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

-- Options (and mappings, below) are part of the content: writable only while
-- the owning version is a DRAFT. A version being deleted (DRAFT, cascading)
-- no longer exists when its children are removed, which is allowed.
CREATE OR REPLACE FUNCTION qup_question_child_freeze() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  old_parent uuid;
  new_parent uuid;
  locked_parent uuid;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    old_parent := OLD.question_version_id;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    new_parent := NEW.question_version_id;
  END IF;

  SELECT qv.id INTO locked_parent
  FROM question_versions qv
  WHERE qv.status <> 'DRAFT'
    AND qv.id IN (old_parent, new_parent)
  LIMIT 1;

  IF locked_parent IS NOT NULL THEN
    RAISE EXCEPTION '% on "%" is not allowed: question version % is not a draft', TG_OP, TG_TABLE_NAME, locked_parent
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

-- Mappings additionally must target a node of the version's taxonomy: a
-- question written against taxonomy v1 cannot claim to measure a v2 skill.
CREATE OR REPLACE FUNCTION qup_question_mapping_taxonomy() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_version_taxonomy uuid;
  v_node_taxonomy uuid;
BEGIN
  SELECT taxonomy_version_id INTO v_version_taxonomy
  FROM question_versions WHERE id = NEW.question_version_id;

  v_node_taxonomy := CASE
    WHEN NEW.skill_id IS NOT NULL THEN qup_taxonomy_version_of_skill(NEW.skill_id)
    ELSE qup_taxonomy_version_of_subskill(NEW.subskill_id)
  END;

  IF v_node_taxonomy IS DISTINCT FROM v_version_taxonomy THEN
    RAISE EXCEPTION 'mapping targets a node outside the taxonomy version of question version %', NEW.question_version_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER question_skill_mappings_taxonomy BEFORE INSERT OR UPDATE ON question_skill_mappings FOR EACH ROW EXECUTE FUNCTION qup_question_mapping_taxonomy();
