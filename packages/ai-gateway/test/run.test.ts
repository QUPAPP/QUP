import { describe, expect, it } from "vitest";

import {
  type AiCompletionRequest,
  type AiProvider,
  draftExplanation,
  FakeAiProvider,
  runAiTask,
  suggestQuestionMetadata,
} from "../src/index.js";

/** AI_INTEGRATION.md "Structured Output", "Fallback", "Observability". */

const question = {
  stem: "ما مرادف كلمة سريع؟",
  options: [
    { key: "A", text: "بطيء", isCorrect: false },
    { key: "B", text: "عاجل", isCorrect: true },
    { key: "C", text: "ثقيل", isCorrect: false },
  ],
};
const nodes = [
  { id: "skill-analogy", name: "التناظر اللفظي" },
  { id: "skill-synonyms", name: "المرادفات" },
];
const options = { timeoutMs: 1000, maxAttempts: 2 };

/** A provider that always answers `text`. */
function answering(text: string): AiProvider {
  return { name: "scripted", complete: async () => ({ text, model: "scripted-1" }) };
}

describe("runAiTask", () => {
  it("returns validated output and a run record", async () => {
    const result = await runAiTask(
      new FakeAiProvider(),
      suggestQuestionMetadata,
      { question, nodes },
      options,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(nodes.map((n) => n.id)).toContain(result.output.nodeId);
    expect(["EASY", "MEDIUM", "HARD"]).toContain(result.output.difficulty);
    expect(result.run).toMatchObject({
      task: "suggest_question_metadata",
      promptVersion: "metadata-v1",
      schemaVersion: "1",
      provider: "fake",
      model: "fake-v1",
      status: "SUCCEEDED",
      attempts: 1,
      errorCode: null,
    });
    expect(result.run.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.run.inputTokens).toBeGreaterThan(0);
    expect(result.run.outputTokens).toBeGreaterThan(0);
  });

  it("retries once after output that is not JSON", async () => {
    const result = await runAiTask(
      new FakeAiProvider({ failures: ["invalid-json"] }),
      suggestQuestionMetadata,
      { question, nodes },
      options,
    );
    expect(result.ok).toBe(true);
    expect(result.run).toMatchObject({ status: "SUCCEEDED", attempts: 2 });
  });

  it("gives up after the attempts are spent", async () => {
    const result = await runAiTask(
      new FakeAiProvider({ failures: ["invalid-json", "invalid-json"] }),
      suggestQuestionMetadata,
      { question, nodes },
      options,
    );
    expect(result.ok).toBe(false);
    expect(result.run).toMatchObject({
      status: "INVALID_OUTPUT",
      attempts: 2,
      errorCode: "INVALID_JSON",
    });
  });

  it("rejects output that does not match the schema", async () => {
    const result = await runAiTask(
      answering('{"nodeId":5,"difficulty":"TRIVIAL"}'),
      suggestQuestionMetadata,
      { question, nodes },
      options,
    );
    expect(result.run).toMatchObject({
      status: "INVALID_OUTPUT",
      attempts: 2,
      errorCode: "SCHEMA_MISMATCH",
      model: "scripted-1",
    });
  });

  it("rejects a skill that was not offered", async () => {
    const result = await runAiTask(
      new FakeAiProvider({ failures: ["wrong-answer", "wrong-answer"] }),
      suggestQuestionMetadata,
      { question, nodes },
      options,
    );
    expect(result.run).toMatchObject({ status: "INVALID_OUTPUT", errorCode: "UNKNOWN_NODE" });
  });

  it("never returns an explanation of a different answer", async () => {
    const result = await runAiTask(
      new FakeAiProvider({ failures: ["wrong-answer", "wrong-answer"] }),
      draftExplanation,
      { question },
      options,
    );
    expect(result.ok).toBe(false);
    expect(result.run).toMatchObject({ status: "INVALID_OUTPUT", errorCode: "ANSWER_MISMATCH" });
  });

  it("drafts an explanation of the real answer", async () => {
    const result = await runAiTask(new FakeAiProvider(), draftExplanation, { question }, options);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output.correctOptionKeys).toEqual(["B"]);
    expect(result.output.explanation).toContain("عاجل");
    expect(result.run).toMatchObject({ promptVersion: "explanation-v1", schemaVersion: "1" });
  });

  it("aborts an attempt that runs past the timeout", async () => {
    let seen: AbortSignal | undefined;
    const provider = new FakeAiProvider({ failures: ["timeout"] });
    const watching: AiProvider = {
      name: provider.name,
      complete: (request: AiCompletionRequest, signal: AbortSignal) => {
        seen = signal;
        return provider.complete(request, signal);
      },
    };
    const result = await runAiTask(
      watching,
      draftExplanation,
      { question },
      {
        ...options,
        timeoutMs: 20,
      },
    );
    expect(result.run).toMatchObject({ status: "TIMED_OUT", attempts: 1, errorCode: "TIMEOUT" });
    expect(seen?.aborted).toBe(true);
  });

  it("times out a provider that ignores the abort", async () => {
    const stuck: AiProvider = { name: "stuck", complete: () => new Promise(() => {}) };
    const result = await runAiTask(
      stuck,
      draftExplanation,
      { question },
      {
        ...options,
        timeoutMs: 20,
      },
    );
    expect(result.run).toMatchObject({ status: "TIMED_OUT", model: null });
  });

  it("does not retry a provider failure", async () => {
    const result = await runAiTask(
      new FakeAiProvider({ failures: ["error", "error"] }),
      draftExplanation,
      { question },
      options,
    );
    expect(result.run).toMatchObject({
      status: "FAILED",
      attempts: 1,
      errorCode: "PROVIDER_ERROR",
    });
  });
});

describe("FakeAiProvider", () => {
  it("answers the same input the same way", async () => {
    const request = {
      ...suggestQuestionMetadata.buildPrompt({ question, nodes }),
      task: suggestQuestionMetadata.name,
      input: { question, nodes },
      maxOutputTokens: suggestQuestionMetadata.maxOutputTokens,
    };
    const signal = new AbortController().signal;
    const first = await new FakeAiProvider().complete(request, signal);
    const second = await new FakeAiProvider().complete(request, signal);
    expect(second).toEqual(first);
  });

  it("picks the skill named in the stem", async () => {
    const result = await runAiTask(
      new FakeAiProvider(),
      suggestQuestionMetadata,
      { question: { ...question, stem: "سؤال في المرادفات: ما مرادف سريع؟" }, nodes },
      options,
    );
    expect(result.ok && result.output.nodeId).toBe("skill-synonyms");
  });
});
