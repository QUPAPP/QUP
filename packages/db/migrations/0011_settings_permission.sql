-- 0011_settings_permission
--
-- Versioned system settings (C1): who may change them.
--   settings.manage   ADMIN only — least privilege while OPEN_QUESTIONS.md #16
--                     (who edits engine configuration) is open.
--
-- Idempotent: safe to re-run; existing rows are left untouched.

INSERT INTO permissions (code, description) VALUES
  ('settings.manage', 'Change versioned system settings.')
ON CONFLICT (code) DO NOTHING;
--> statement-breakpoint

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = 'settings.manage'
WHERE r.code = 'ADMIN'
ON CONFLICT DO NOTHING;
