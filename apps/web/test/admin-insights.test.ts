import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getLearningMetrics,
  getSessionDecisions,
  listAuditLogs,
} from "../src/lib/admin-insights-api";
import { REASON_CODES, reasonLabel, windowFromQuery } from "../src/lib/decision-labels";

afterEach(() => vi.unstubAllGlobals());

describe("admin insights", () => {
  it("calls the admin read routes", async () => {
    const request = vi.fn().mockImplementation(async () => Response.json({ items: [] }));
    vi.stubGlobal("fetch", request);
    await getLearningMetrics(30);
    await listAuditLogs({ resourceType: "question", action: "", limit: 20, offset: 40 });
    await getSessionDecisions("s1");
    expect(request.mock.calls.map(([url]) => url)).toEqual([
      "/api/v1/admin/analytics/learning?days=30",
      "/api/v1/admin/audit-logs?limit=20&offset=40&resourceType=question",
      "/api/v1/admin/adaptive-decisions?sessionId=s1",
    ]);
  });

  it("explains every reason code in Arabic, and shows an unknown one as is", () => {
    for (const code of REASON_CODES) expect(reasonLabel(code)).toMatch(/[؀-ۿ]/);
    expect(reasonLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW");
  });

  it("offers only the windows the API accepts", () => {
    expect(windowFromQuery("30")).toBe(30);
    expect(windowFromQuery("3")).toBe(7);
    expect(windowFromQuery(null)).toBe(7);
  });
});
