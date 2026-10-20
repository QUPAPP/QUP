import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getAiStatus,
  listAiRuns,
  requestExplanationDraft,
  requestMetadataSuggestion,
} from "../src/lib/ai-api";
import {
  AI_ERROR_MESSAGES,
  AI_STATUS_LABELS,
  aiErrorMessage,
  applySuggestion,
  difficultyLabel,
  explanationBlocks,
} from "../src/lib/ai-assist";
import { ApiError } from "../src/lib/api";
import type { QuestionForm } from "../src/lib/question-form";

/** C3: the editor's AI panel and the AI runs page (API_CONTRACTS.md "AI Assistance"). */

afterEach(() => vi.unstubAllGlobals());

const mapping = (target: string, role: "PRIMARY" | "SECONDARY", weight = "") => ({
  target,
  role,
  weight,
  rationale: "",
});

describe("AI client", () => {
  it("calls the AI routes", async () => {
    const request = vi.fn().mockImplementation(async () => Response.json({}));
    vi.stubGlobal("fetch", request);
    await getAiStatus();
    await requestMetadataSuggestion("v1");
    await requestExplanationDraft("v1");
    await listAiRuns({ limit: 20, offset: 40 });
    expect(request.mock.calls.map(([url, init]) => [url, init?.method ?? "GET"])).toEqual([
      ["/api/v1/admin/ai/status", "GET"],
      ["/api/v1/admin/question-versions/v1/ai/metadata-suggestion", "POST"],
      ["/api/v1/admin/question-versions/v1/ai/explanation-draft", "POST"],
      ["/api/v1/admin/ai/runs?limit=20&offset=40", "GET"],
    ]);
  });
});

describe("applying a suggestion", () => {
  const form: Pick<QuestionForm, "mappings" | "difficulty"> = {
    difficulty: "0.5",
    mappings: [
      mapping("skill:old", "PRIMARY", "0.8"),
      mapping("skill:other", "SECONDARY"),
      mapping("subskill:sub", "SECONDARY", "0.3"),
    ],
  };

  it("makes the suggested skill the primary mapping and sets the difficulty", () => {
    const next = applySuggestion(form, {
      skillId: "new",
      subskillId: null,
      nodeName: "المرادفات",
      difficulty: 0.75,
      rationale: "…",
    });
    expect(next).toEqual({
      difficulty: "0.75",
      mappings: [
        mapping("skill:new", "PRIMARY"),
        mapping("skill:other", "SECONDARY"),
        mapping("subskill:sub", "SECONDARY", "0.3"),
      ],
    });
  });

  it("promotes a node that was already a secondary mapping, keeping its weight", () => {
    const next = applySuggestion(form, {
      skillId: null,
      subskillId: "sub",
      nodeName: "المرادفات › الأفعال",
      difficulty: 0.25,
      rationale: "…",
    });
    expect(next.mappings).toEqual([
      mapping("subskill:sub", "PRIMARY", "0.3"),
      mapping("skill:other", "SECONDARY"),
    ]);
  });
});

describe("labels", () => {
  it("names the difficulty as the editor does", () => {
    expect(difficultyLabel(0.25)).toBe("سهل");
    expect(difficultyLabel(0.75)).toBe("صعب");
    expect(difficultyLabel(0.6)).toBe("مخصص (0.6)");
  });

  it("puts an explanation draft in one text block", () => {
    expect(explanationBlocks("  شرح  ")).toEqual([{ type: "text", value: "شرح" }]);
  });

  it("explains each AI error code in Arabic", () => {
    for (const message of Object.values(AI_ERROR_MESSAGES)) expect(message).toMatch(/[؀-ۿ]/);
    expect(aiErrorMessage(new ApiError(503, "AI_TIMEOUT", "late", undefined))).toBe(
      AI_ERROR_MESSAGES.AI_TIMEOUT,
    );
    expect(aiErrorMessage(new Error("boom"))).toBeNull();
    expect(Object.keys(AI_STATUS_LABELS).sort()).toEqual([
      "FAILED",
      "INVALID_OUTPUT",
      "SUCCEEDED",
      "TIMED_OUT",
    ]);
  });
});
