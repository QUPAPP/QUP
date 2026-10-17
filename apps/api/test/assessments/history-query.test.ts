import { describe, expect, it } from "vitest";

import { sessionHistoryQuery } from "../../src/modules/assessments/presentation/assessments.dto.js";

describe("session history boundary", () => {
  it("defaults to a bounded first page", () => {
    expect(sessionHistoryQuery.parse({})).toEqual({ limit: 20, offset: 0 });
  });

  it("parses URL pagination and optional exam/status filters", () => {
    expect(
      sessionHistoryQuery.parse({
        examId: "12345678-1234-4234-8234-123456789abc",
        status: "IN_PROGRESS",
        limit: "10",
        offset: "20",
      }),
    ).toEqual({
      examId: "12345678-1234-4234-8234-123456789abc",
      status: "IN_PROGRESS",
      limit: 10,
      offset: 20,
    });
  });

  it.each([
    { studentId: "12345678-1234-4234-8234-123456789abc" },
    { status: "UNKNOWN" },
    { examId: "invalid" },
    { limit: "0" },
    { limit: "101" },
    { offset: "-1" },
    { offset: "1000001" },
    { offset: "Infinity" },
    { limit: ["10", "20"] },
  ])("rejects invalid or forged query %j", (query) => {
    expect(sessionHistoryQuery.safeParse(query).success).toBe(false);
  });
});
