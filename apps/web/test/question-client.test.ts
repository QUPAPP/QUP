import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../src/lib/api";
import {
  getTaxonomyOutline,
  listQuestions,
  reviewVersion,
  submitForReview,
  updateDraft,
} from "../src/lib/question-api";

afterEach(() => vi.unstubAllGlobals());

const content = {
  questionType: "SINGLE_CHOICE" as const,
  stem: { blocks: [{ type: "text" as const, text: "سؤال" }] },
  difficulty: 0.5,
  taxonomyVersionId: "v1",
  options: [],
  mappings: [],
};

describe("question client", () => {
  it("lists questions with paging and filters in the query", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(Response.json({ items: [], page: { limit: 20, offset: 40, total: 0 } }));
    vi.stubGlobal("fetch", request);
    await listQuestions({ limit: 20, offset: 40, status: "DRAFT" });
    expect(request).toHaveBeenCalledWith(
      "/api/v1/admin/questions?limit=20&offset=40&status=DRAFT",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("replaces a draft's content with PUT", async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ id: "qv1" }));
    vi.stubGlobal("fetch", request);
    await updateDraft("qv1", content);
    expect(request).toHaveBeenCalledWith(
      "/api/v1/admin/question-versions/qv1",
      expect.objectContaining({ method: "PUT", body: JSON.stringify(content) }),
    );
  });

  it("sends a review decision with its notes", async () => {
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", request);
    await reviewVersion("qv1", { decision: "CHANGES_REQUESTED", notes: "وضّح الخيار ب" });
    expect(request).toHaveBeenCalledWith(
      "/api/v1/admin/question-versions/qv1/reviews",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ decision: "CHANGES_REQUESTED", notes: "وضّح الخيار ب" }),
      }),
    );
  });

  it("keeps the broken rules of an invalid submission", async () => {
    const details = [{ path: "", message: "x", rule: "CORRECT_ANSWER_COUNT" }];
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ error: { code: "QUESTION_CONTENT_INVALID", details } }, { status: 422 }),
        ),
    );
    const error = await submitForReview("qv1").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).details).toEqual(details);
  });

  it("reads a version's outline from the authoring context", async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ version: {}, domains: [] }));
    vi.stubGlobal("fetch", request);
    await getTaxonomyOutline("v1");
    expect(request).toHaveBeenCalledWith(
      "/api/v1/admin/question-authoring/taxonomy-versions/v1/outline",
      expect.anything(),
    );
  });
});
