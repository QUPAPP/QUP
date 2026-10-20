-- 0012_blueprints_permission
--
-- Diagnostic blueprints (B2).
--   assessment_blueprints_one_active  at most one ACTIVE blueprint per exam and type; activation
--                                     archives the previous one in the same transaction.
--   blueprints.manage                 ADMIN only, like settings.manage (OPEN_QUESTIONS.md #16).
--
-- Additive. Local data held no ACTIVE blueprints when this was written, so the index cannot fail.

CREATE UNIQUE INDEX "assessment_blueprints_one_active" ON "assessment_blueprints" USING btree ("exam_id","type") WHERE status = 'ACTIVE';--> statement-breakpoint

INSERT INTO permissions (code, description) VALUES
  ('blueprints.manage', 'Create, edit, activate and archive assessment blueprints.')
ON CONFLICT (code) DO NOTHING;
--> statement-breakpoint

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = 'blueprints.manage'
WHERE r.code = 'ADMIN'
ON CONFLICT DO NOTHING;
