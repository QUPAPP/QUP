import { describe, expect, it } from "vitest";
import { isActivePath, isAdminPath, isWorkspacePath } from "../src/lib/navigation";

describe("student navigation", () => {
  it.each([
    "/dashboard",
    "/exams",
    "/exams/exam-id/diagnostic",
    "/assessments/session-id/result",
    "/subscriptions",
    "/account",
    "/payment/return",
  ])("places %s in the student workspace", (path) => {
    expect(isWorkspacePath(path)).toBe(true);
  });
  it.each(["/", "/login", "/register", "/exams-other", "/accounting", "/dashboard-preview"])(
    "keeps %s outside the workspace",
    (path) => {
      expect(isWorkspacePath(path)).toBe(false);
    },
  );
  it("keeps the student's session and result under the sessions navigation", () => {
    expect(isActivePath("/assessments/session-id/result", "/dashboard")).toBe(true);
    expect(isActivePath("/assessments/session-id/result", "/exams")).toBe(false);
  });
  it("uses complete path boundaries for the active item", () => {
    expect(isActivePath("/exams/exam-id/diagnostic", "/exams")).toBe(true);
    expect(isActivePath("/exams-other", "/exams")).toBe(false);
  });
});

describe("admin navigation", () => {
  it.each(["/admin", "/admin/exams", "/admin/exams/exam-id"])(
    "treats %s as an admin path",
    (path) => {
      expect(isAdminPath(path)).toBe(true);
    },
  );
  it("uses a complete path boundary", () => {
    expect(isAdminPath("/administrator")).toBe(false);
  });
  it("keeps the admin panel out of the student workspace", () => {
    expect(isWorkspacePath("/admin")).toBe(false);
  });
  it("keeps a question version under the question bank item", () => {
    expect(isActivePath("/admin/question-versions/version-id", "/admin/questions")).toBe(true);
    expect(isActivePath("/admin/questions/new", "/admin/questions")).toBe(true);
    expect(isActivePath("/admin/question-versions/version-id", "/admin/exams")).toBe(false);
  });
  it("keeps a taxonomy version under the exams and taxonomy item", () => {
    expect(isActivePath("/admin/taxonomy-versions/version-id", "/admin/exams")).toBe(true);
    expect(isActivePath("/admin/taxonomy-versions/version-id", "/dashboard")).toBe(false);
  });
});
