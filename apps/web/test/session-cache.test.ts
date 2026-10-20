import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ME_QUERY_KEY, startSession } from "../src/lib/session-cache";

afterEach(() => vi.unstubAllGlobals());

const me = {
  user: { id: "u1", email: "admin@qup.test", phone: null, displayName: null },
  roles: ["ADMIN"],
  permissions: ["taxonomy.manage"],
};

describe("session cache", () => {
  it("replaces the previous account's data with the new account and its permissions", async () => {
    const client = new QueryClient();
    client.setQueryData(["assessment-history", "previous-user"], { items: [] });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(me)));

    await startSession(client);

    expect(client.getQueryData(ME_QUERY_KEY)).toEqual(me);
    expect(client.getQueryData(["assessment-history", "previous-user"])).toBeUndefined();
  });
});
