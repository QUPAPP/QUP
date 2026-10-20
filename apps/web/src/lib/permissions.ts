import type { IconName } from "@/components/icon";

import type { Me } from "./api";

/**
 * Permission codes the admin panel uses — identifiers shared with the API
 * (apps/api/src/modules/rbac/permissions.ts), not rules. They only decide
 * what the interface offers; the API checks them again on every call.
 */
export const ADMIN_PERMISSIONS = {
  taxonomyManage: "taxonomy.manage",
  questionsCreate: "questions.create",
  questionsReview: "questions.review",
  questionsPublish: "questions.publish",
  settingsManage: "settings.manage",
  blueprintsManage: "blueprints.manage",
  auditView: "audit.view",
} as const;

export function hasPermission(me: Me | null | undefined, code: string): boolean {
  return me?.permissions.includes(code) ?? false;
}

export function hasAdminAccess(me: Me | null | undefined): boolean {
  return Object.values(ADMIN_PERMISSIONS).some((code) => hasPermission(me, code));
}

interface AdminNavItem {
  href: string;
  title: string;
  icon: IconName;
  permission: string;
}

const ADMIN_NAV: readonly AdminNavItem[] = [
  {
    href: "/admin/exams",
    title: "الاختبارات والتصنيف",
    icon: "book",
    permission: ADMIN_PERMISSIONS.taxonomyManage,
  },
  {
    href: "/admin/questions",
    title: "بنك الأسئلة",
    icon: "grid",
    permission: ADMIN_PERMISSIONS.questionsCreate,
  },
  {
    href: "/admin/imports",
    title: "استيراد الأسئلة",
    icon: "plus",
    permission: ADMIN_PERMISSIONS.questionsCreate,
  },
  {
    href: "/admin/settings",
    title: "الإعدادات",
    icon: "compass",
    permission: ADMIN_PERMISSIONS.settingsManage,
  },
  {
    href: "/admin/analytics",
    title: "المؤشرات",
    icon: "chart",
    permission: ADMIN_PERMISSIONS.auditView,
  },
  {
    href: "/admin/audit",
    title: "سجل التدقيق",
    icon: "eye",
    permission: ADMIN_PERMISSIONS.auditView,
  },
  {
    href: "/admin/adaptive-decisions",
    title: "قرارات التدريب",
    icon: "compass",
    permission: ADMIN_PERMISSIONS.auditView,
  },
];

export function adminNavItems(
  me: Me | null | undefined,
): { href: string; title: string; icon: IconName }[] {
  return ADMIN_NAV.filter((item) => hasPermission(me, item.permission)).map(
    ({ href, title, icon }) => ({ href, title, icon }),
  );
}

/** Where /admin opens for this account: its first permitted screen, or null for none. */
export function firstAdminScreen(me: Me | null | undefined): string | null {
  return adminNavItems(me)[0]?.href ?? null;
}
