import { describe, expect, it } from "vitest";
import { isActivePath, isWorkspacePath } from "../src/lib/navigation";

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
