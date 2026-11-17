import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../src/lib/api";
import { addKnowledge, archiveKnowledge, listKnowledge } from "../src/lib/knowledge-api";
import { errorMessage } from "../src/lib/messages";
import { chatRulesProblem, freeTrialProblem, rulesFromText } from "../src/lib/settings-form";
import { clearChat, getAiFeatures, getChat, sendChatMessage } from "../src/lib/tutor-api";

/** AI_INTEGRATION.md "Knowledge Library", "Study Chat": the admin library and the student chat. */

afterEach(() => vi.unstubAllGlobals());

function recordCalls() {
  const request = vi
    .fn()
    .mockImplementation(async () => Response.json({ items: [], page: { hasMore: false } }));
  vi.stubGlobal("fetch", request);
  return () =>
    request.mock.calls.map(([url, init]) => [
      url,
      init?.method ?? "GET",
      init?.body ? JSON.parse(String(init.body)) : undefined,
    ]);
}

describe("AI clients", () => {
  it("calls the library routes", async () => {
    const calls = recordCalls();
    await listKnowledge({ examId: null, limit: 20, offset: 0 });
    await listKnowledge({ examId: "e1", limit: 20, offset: 40 });
    await addKnowledge({
      taxonomyVersionId: "v1",
      nodeId: null,
      kind: "EXAMPLE",
      title: "نموذج",
      content: "س١",
    });
    await archiveKnowledge("k1");
    expect(calls()).toEqual([
      ["/api/v1/admin/ai/knowledge?limit=20&offset=0", "GET", undefined],
      ["/api/v1/admin/ai/knowledge?limit=20&offset=40&examId=e1", "GET", undefined],
      [
        "/api/v1/admin/ai/knowledge",
        "POST",
        { taxonomyVersionId: "v1", nodeId: null, kind: "EXAMPLE", title: "نموذج", content: "س١" },
      ],
      ["/api/v1/admin/ai/knowledge/k1/archive", "POST", undefined],
    ]);
  });

  it("calls the study chat routes for the exam", async () => {
    const calls = recordCalls();
    await getAiFeatures("e1");
    await getAiFeatures();
    await getChat("e1");
    await sendChatMessage("e1", "كيف أذاكر؟");
    await clearChat("e1");
    expect(calls()).toEqual([
      ["/api/v1/me/ai-features?examId=e1", "GET", undefined],
      ["/api/v1/me/ai-features", "GET", undefined],
      ["/api/v1/exams/e1/ai-chat", "GET", undefined],
      ["/api/v1/exams/e1/ai-chat", "POST", { message: "كيف أذاكر؟" }],
      ["/api/v1/exams/e1/ai-chat", "DELETE", undefined],
    ]);
  });

  it("explains the subscription and limit errors in Arabic", () => {
    for (const code of [
      "AI_REQUIRES_SUBSCRIPTION",
      "AI_CHAT_LIMIT_REACHED",
      "AI_STUDY_CHAT_OFF",
      "AI_FREE_LIMIT_REACHED",
    ]) {
      const message = errorMessage(new ApiError(403, code, "x", null));
      expect(message).toMatch(/[؀-ۿ]/);
    }
  });
});

describe("study chat rules form", () => {
  it("reads one rule per line and checks the API's bounds", () => {
    expect(rulesFromText(" أولى \r\n\n ثانية\n")).toEqual(["أولى", "ثانية"]);
    expect(chatRulesProblem(["قاعدة"])).toBeNull();
    expect(chatRulesProblem(Array.from({ length: 21 }, () => "ق"))).toContain("20");
    expect(chatRulesProblem(["ق", "ق".repeat(301)])).toContain("القاعدة 2");
  });

  it("accepts a free allowance from 0 to 100 only", () => {
    expect(freeTrialProblem(" 5 ")).toBeNull();
    expect(freeTrialProblem("0")).toBeNull();
    expect(freeTrialProblem("101")).toContain("100");
    expect(freeTrialProblem("2.5")).not.toBeNull();
    expect(freeTrialProblem("")).not.toBeNull();
  });
});
