import { afterEach, describe, expect, it, vi } from "vitest";

import { type ApiError, listAssessmentHistory } from "../src/lib/api";

afterEach(() => vi.unstubAllGlobals());

describe("student history client", () => {
  it("requests the selected page through the same-origin authenticated API", async () => {
    const body = { items: [], page: { limit: 10, offset: 20, hasMore: false } };
    const request = vi.fn().mockResolvedValue(Response.json(body));
    vi.stubGlobal("fetch", request);
    expect(await listAssessmentHistory({ limit: 10, offset: 20, status: "COMPLETED" })).toEqual(
      body,
    );
    expect(request).toHaveBeenCalledWith(
      "/api/v1/assessments?limit=10&offset=20&status=COMPLETED",
      expect.objectContaining({
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      }),
    );
  });

  it("includes the requested exam filter without inventing a student identity", async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ items: [], page: {} }));
    vi.stubGlobal("fetch", request);
    await listAssessmentHistory({ limit: 10, offset: 0, examId: "exam-id" });
    expect(request.mock.calls[0]?.[0]).toBe("/api/v1/assessments?limit=10&offset=0&examId=exam-id");
  });

  it("propagates session expiry so private data is not displayed as a successful empty page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: { code: "UNAUTHENTICATED", message: "Sign in required." },
          },
          { status: 401 },
        ),
      ),
    );
    await expect(listAssessmentHistory({ limit: 10, offset: 0 })).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHENTICATED",
    } satisfies Partial<ApiError>);
  });
});
