import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { draftExplanation, runAiTask } from "@qup/ai-gateway";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { OpenAiCompatibleProvider } from "../../src/modules/ai/infrastructure/openai-compatible-provider.js";

/** The OpenAI-protocol adapter (Grok, OpenAI, …) against a local stand-in: no network, no key. */

let server: Server;
let baseUrl: string;
let next: { status: number; body: object } = { status: 200, body: {} };
const seen: { url: string; headers: IncomingMessage["headers"]; body: Record<string, unknown> }[] =
  [];

function completion(content: string, finishReason = "stop") {
  return {
    id: "chatcmpl-test",
    model: "grok-test-model",
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: finishReason }],
    usage: { prompt_tokens: 90, completion_tokens: 30 },
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
  new OpenAiCompatibleProvider({
    name: "grok",
    baseUrl: `${baseUrl}/v1/`,
    apiKey: "xai-test",
    model: "grok-test-model",
  });

beforeAll(async () => {
  server = createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
    });
    request.on("end", () => {
      seen.push({
        url: request.url ?? "",
        headers: request.headers,
        body: JSON.parse(raw || "{}"),
      });
      response.writeHead(next.status, { "content-type": "application/json" });
      response.end(JSON.stringify(next.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("OpenAI-compatible provider", () => {
  it("sends the system prompt and data as chat messages and returns the answer", async () => {
    next = {
      status: 200,
      body: completion('{"correctOptionKeys":["B"],"explanation":"عاجل تعني سريع."}'),
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
      provider: "grok",
      model: "grok-test-model",
      inputTokens: 90,
      outputTokens: 30,
    });
    const request = seen.at(-1);
    expect(request?.url).toBe("/v1/chat/completions");
    expect(request?.headers.authorization).toBe("Bearer xai-test");
    expect(request?.body).toMatchObject({
      model: "grok-test-model",
      messages: [{ role: "system" }, { role: "user" }],
    });
  });

  it("treats an HTTP error or a cut-off answer as a provider failure, never as output", async () => {
    next = { status: 401, body: { error: { message: "bad key" } } };
    const unauthorized = await runAiTask(
      provider(),
      draftExplanation,
      { question },
      {
        timeoutMs: 5000,
        maxAttempts: 1,
      },
    );
    expect(unauthorized.run).toMatchObject({ status: "FAILED", errorCode: "PROVIDER_ERROR" });

    next = { status: 200, body: completion('{"explanation":"المر', "length") };
    const cut = await runAiTask(
      provider(),
      draftExplanation,
      { question },
      {
        timeoutMs: 5000,
        maxAttempts: 1,
      },
    );
    expect(cut.run).toMatchObject({ status: "FAILED", errorCode: "PROVIDER_ERROR" });
  });
});
