import { afterEach, describe, expect, it, vi } from "vitest";

import {
  listTaxonomyVersions,
  publishTaxonomyVersion,
  removePrerequisite,
  updateDomain,
} from "../src/lib/admin-api";
import { getMe } from "../src/lib/api";

afterEach(() => vi.unstubAllGlobals());

describe("admin client", () => {
  it("edits a domain with PATCH and a JSON body", async () => {
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", request);
    await expect(updateDomain("d1", { name: "ج" })).resolves.toBeUndefined();
    expect(request).toHaveBeenCalledWith(
      "/api/v1/admin/domains/d1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ name: "ج" }),
        credentials: "same-origin",
      }),
    );
  });

  it("removes a prerequisite with DELETE and no body", async () => {
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", request);
    await removePrerequisite("s1", "s2");
    expect(request).toHaveBeenCalledWith(
      "/api/v1/admin/skills/s1/prerequisites/s2",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(request.mock.calls[0]?.[1]).not.toHaveProperty("body");
  });

  it("lists an exam's taxonomy versions", async () => {
    const body = {
      items: [
        {
          id: "v2",
          examId: "e1",
          versionCode: "2026.2",
          status: "DRAFT",
          effectiveFrom: null,
          createdAt: "2026-10-20T00:00:00.000Z",
        },
      ],
    };
    const request = vi.fn().mockResolvedValue(Response.json(body));
    vi.stubGlobal("fetch", request);
    expect(await listTaxonomyVersions("e1")).toEqual(body);
    expect(request).toHaveBeenCalledWith(
      "/api/v1/admin/exams/e1/taxonomy-versions",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("surfaces an expired session as UNAUTHENTICATED", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(Response.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 })),
    );
    await expect(publishTaxonomyVersion("v1")).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      status: 401,
    });
  });

  it("keeps permissions from /auth/me", async () => {
    const body = {
      user: { id: "u1", email: "a@qup.test", phone: null, displayName: null },
      roles: ["ADMIN"],
      permissions: ["taxonomy.manage"],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
    expect((await getMe()).permissions).toEqual(["taxonomy.manage"]);
  });
});
