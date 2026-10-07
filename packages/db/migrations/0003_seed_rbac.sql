-- 0003_seed_rbac
--
-- Reference data the application depends on: roles, permissions and the
-- grants between them. No personal data.
--
-- Sources:
--   roles/permissions        ERD.md "Identity/RBAC", SECURITY.md "Authorization"
--   CONTENT_MANAGER grants   OPEN_QUESTIONS.md #14 (decided 2026-09-22):
--                            creates, reviews and approves; only ADMIN publishes.
--   taxonomy.manage          OPEN_QUESTIONS.md #16a (open): ADMIN only for now —
--                            least privilege until decided.
--   STUDENT                  no permissions: student access is ownership-based
--                            (own sessions, own progress), not permission-based.
--
-- Idempotent: safe to re-run; existing rows are left untouched.

INSERT INTO roles (code, name, description) VALUES
  ('STUDENT',         'Student',         'Learner taking diagnostics and practice.'),
  ('CONTENT_MANAGER', 'Content manager', 'Authors, reviews and approves question content. Cannot publish.'),
  ('ADMIN',           'Administrator',   'Full administrative access, including publishing.')
ON CONFLICT (code) DO NOTHING;
--> statement-breakpoint

INSERT INTO permissions (code, description) VALUES
  ('questions.create',  'Create questions and draft versions.'),
  ('questions.review',  'Review and approve question versions.'),
  ('questions.publish', 'Publish approved question versions.'),
  ('taxonomy.manage',   'Manage exams, taxonomy versions, domains, skills and subskills.'),
  ('billing.manage',    'Manage plans, payments and entitlements.'),
  ('users.manage',      'Manage users and role assignments.'),
  ('audit.view',        'Read the audit log.'),
  ('ai.manage',         'Manage AI providers and settings.')
ON CONFLICT (code) DO NOTHING;
--> statement-breakpoint

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON
     (r.code = 'ADMIN')
  OR (r.code = 'CONTENT_MANAGER' AND p.code IN ('questions.create', 'questions.review'))
ON CONFLICT DO NOTHING;
