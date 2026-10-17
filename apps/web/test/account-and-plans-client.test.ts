import { afterEach, describe, expect, it, vi } from "vitest";
import { getExamAccess, revokeOtherSessions } from "../src/lib/api";

afterEach(() => vi.unstubAllGlobals());

describe("account and subscription client", () => {
  it("uses the server's exam access status instead of inferring access from a plan", async () => {
    const body = { examId: "exam-id", hasAccess: false, activeUntil: null };
    const request = vi.fn().mockResolvedValue(Response.json(body));
    vi.stubGlobal("fetch", request);
    expect(await getExamAccess("exam-id")).toEqual(body);
    expect(request).toHaveBeenCalledWith(
      "/api/v1/exams/exam-id/my-access",
      expect.objectContaining({ credentials: "same-origin", cache: "no-store" }),
    );
  });
  it("revokes other sessions with a cookie-authenticated write and no client-selected user id", async () => {
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", request);
    await expect(revokeOtherSessions()).resolves.toBeUndefined();
    expect(request).toHaveBeenCalledWith(
      "/api/v1/auth/sessions/revoke",
      expect.objectContaining({ method: "POST", credentials: "same-origin" }),
    );
    expect(request.mock.calls[0]?.[1]).not.toHaveProperty("body");
  });
  it("surfaces a failed session revocation instead of reporting success", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(Response.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 })),
    );
    await expect(revokeOtherSessions()).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      status: 401,
    });
  });
});
