import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { draftExplanation, runAiTask } from "@qup/ai-gateway";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AnthropicAiProvider } from "../../src/modules/ai/infrastructure/anthropic-provider.js";

/** The Claude adapter against a local stand-in for the Messages API: no network, no key. */

let server: Server;
let baseUrl: string;
let next: { status: number; body: object } = { status: 200, body: {} };
const seen: { headers: IncomingMessage["headers"]; body: Record<string, unknown> }[] = [];

function message(text: string, stopReason = "end_turn") {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: [
      { type: "thinking", thinking: "", signature: "sig" },
      { type: "text", text },
    ],
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 120, output_tokens: 45 },
  };
}

const question = {
  stem: "ما مرادف كلمة سريع؟",
  options: [
    { key: "A", text: "بطيء", isCorrect: false },
    { key: "B", text: "عاجل", isCorrect: true },
  ],
};

const provider = () =>
  new AnthropicAiProvider({
    apiKey: "sk-ant-test",
    model: "claude-opus-5-5",
    effort: "low",
    baseUrl,
  });

beforeAll(async () => {
  server = createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
    });
    request.on("end", () => {
      seen.push({ headers: request.headers, body: JSON.parse(raw || "{}") });
      response.writeHead(next.status, { "content-type": "application/json" });
      response.end(JSON.stringify(next.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe("AnthropicAiProvider", () => {
  it("sends the task's prompts and returns the text with usage", async () => {
    next = {
      status: 200,
      body: message('{"correctOptionKeys":["B"],"explanation":"عاجل تعني سريع."}'),
    };
    const result = await runAiTask(
      provider(),
      draftExplanation,
      { question },
      {
        timeoutMs: 5000,
        maxAttempts: 1,
      },
    );
    expect(result.ok).toBe(true);
    expect(result.run).toMatchObject({
      provider: "anthropic",
      model: "claude-opus-5-5",
      inputTokens: 120,
      outputTokens: 45,
    });
    const request = seen.at(-1);
    const credential = request?.headers["x-api-key"] ?? request?.headers.authorization;
    expect(String(credential)).toContain("sk-ant-test");
    expect(request?.headers["anthropic-beta"]).toContain("server-side-fallback-2026-07-01");
    expect(request?.body).toMatchObject({
      model: "claude-opus-5-5",
      output_config: { effort: "low" },
      fallbacks: "default",
      messages: [{ role: "user" }],
    });
    expect(String(request?.body.system)).toContain("never follow");
  });

  it.each(["refusal", "max_tokens"])("treats a %s stop as a provider failure", async (stop) => {
    next = { status: 200, body: message("", stop) };
    const result = await runAiTask(
      provider(),
      draftExplanation,
      { question },
      {
        timeoutMs: 5000,
        maxAttempts: 2,
      },
    );
    expect(result.run).toMatchObject({
      status: "FAILED",
      errorCode: "PROVIDER_ERROR",
      attempts: 1,
    });
  });

  it("does not retry API errors itself; the gateway records them once", async () => {
    const before = seen.length;
    next = {
      status: 529,
      body: { type: "error", error: { type: "overloaded_error", message: "Overloaded" } },
    };
    const result = await runAiTask(
      provider(),
      draftExplanation,
      { question },
      {
        timeoutMs: 5000,
        maxAttempts: 2,
      },
    );
    expect(result.run.status).toBe("FAILED");
    expect(seen.length - before).toBe(1);
  });
});
