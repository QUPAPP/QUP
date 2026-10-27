import { describe, expect, it } from "vitest";

import type { Me } from "../src/lib/api";
import {
  adminNavItems,
  firstAdminScreen,
  hasAdminAccess,
  hasPermission,
  homePath,
} from "../src/lib/permissions";

const account = (permissions: string[]): Me => ({
  user: { id: "u1", email: "u@qup.test", phone: null, displayName: null },
  roles: [],
  permissions,
});

const admin = account([
  "taxonomy.manage",
  "questions.create",
  "questions.publish",
  "settings.manage",
  "audit.view",
  "ai.manage",
]);
const student = account([]);
const contentManager = account(["questions.create", "questions.review"]);

describe("permissions", () => {
  it("grants nothing without an account", () => {
    expect(hasPermission(null, "taxonomy.manage")).toBe(false);
    expect(hasPermission(undefined, "taxonomy.manage")).toBe(false);
    expect(hasAdminAccess(null)).toBe(false);
  });

  it("reads a permission the API granted", () => {
    expect(hasPermission(admin, "taxonomy.manage")).toBe(true);
    expect(hasPermission(student, "taxonomy.manage")).toBe(false);
  });

  it("offers the admin panel only to holders of a permission it uses", () => {
    expect(hasAdminAccess(admin)).toBe(true);
    expect(hasAdminAccess(student)).toBe(false);
    // A2: content managers author questions in the panel.
    expect(hasAdminAccess(contentManager)).toBe(true);
  });

  it("lists only the admin screens the account may use", () => {
    expect(adminNavItems(admin).map((item) => item.href)).toEqual([
      "/admin/exams",
      "/admin/questions",
      "/admin/imports",
      "/admin/settings",
      "/admin/analytics",
      "/admin/audit",
      "/admin/adaptive-decisions",
      "/admin/ai",
    ]);
    // Taxonomy management stays admin-only (OPEN_QUESTIONS.md #16a).
    expect(adminNavItems(contentManager).map((item) => item.href)).toEqual([
      "/admin/questions",
      "/admin/imports",
    ]);
    expect(adminNavItems(null)).toEqual([]);
  });

  it("opens the panel on the first screen the account may use", () => {
    expect(firstAdminScreen(admin)).toBe("/admin/exams");
    expect(firstAdminScreen(contentManager)).toBe("/admin/questions");
    expect(firstAdminScreen(student)).toBeNull();
  });

  // Regression: an administrator used to land on the student workspace after signing in.
  it("sends an account to the panel when it may use it, otherwise to the student workspace", () => {
    expect(homePath(admin)).toBe("/admin");
    expect(homePath(contentManager)).toBe("/admin");
    expect(homePath(student)).toBe("/dashboard");
    expect(homePath(null)).toBe("/dashboard");
  });
});
