/**
 * Permission codes. Must match the rows seeded by
 * packages/db/migrations/0003_seed_rbac.sql — an integration test enforces it.
 *
 * Code checks permissions, never role names: which role holds a permission is
 * data (and a product decision), so it can change without a code change.
 */
export const Permission = {
  QuestionsCreate: "questions.create",
  QuestionsReview: "questions.review",
  QuestionsPublish: "questions.publish",
  TaxonomyManage: "taxonomy.manage",
  BillingManage: "billing.manage",
  UsersManage: "users.manage",
  AuditView: "audit.view",
  AiManage: "ai.manage",
  SettingsManage: "settings.manage",
  BlueprintsManage: "blueprints.manage",
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

const KNOWN_PERMISSIONS: ReadonlySet<string> = new Set(Object.values(Permission));

export function isPermission(code: string): code is Permission {
  return KNOWN_PERMISSIONS.has(code);
}
