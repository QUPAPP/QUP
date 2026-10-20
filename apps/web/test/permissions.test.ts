import { describe, expect, it } from "vitest";

import type { Me } from "../src/lib/api";
import { adminNavItems, hasAdminAccess, hasPermission } from "../src/lib/permissions";

const account = (permissions: string[]): Me => ({
  user: { id: "u1", email: "u@qup.test", phone: null, displayName: null },
  roles: [],
  permissions,
});

const admin = account(["taxonomy.manage", "questions.create", "questions.publish"]);
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
    // A1 has no screen for question permissions yet (A2 adds one).
    expect(hasAdminAccess(contentManager)).toBe(false);
  });

  it("lists only the admin screens the account may use", () => {
    expect(adminNavItems(admin).map((item) => item.href)).toEqual(["/admin/exams"]);
    expect(adminNavItems(contentManager)).toEqual([]);
    expect(adminNavItems(null)).toEqual([]);
  });
});
