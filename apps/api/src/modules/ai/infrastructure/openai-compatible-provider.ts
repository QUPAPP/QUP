import type { AiCompletion, AiCompletionRequest, AiProvider } from "@qup/ai-gateway";

export interface OpenAiCompatibleOptions {
  /** Recorded in ai_runs, e.g. "grok" or "openai-compatible". */
  name: string;
  /** Up to and including the version segment, e.g. https://api.x.ai/v1 */
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** A non-2xx answer, a cut-off answer or an empty one: never output. */
export class OpenAiCompatibleNoAnswer extends Error {
  constructor(readonly reason: string) {
    super(`The AI provider returned no usable answer (${reason})`);
    this.name = "OpenAiCompatibleNoAnswer";
  }
}

interface ChatCompletion {
  model?: string;
  choices?: { message?: { content?: string | null }; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * One adapter for every vendor that speaks the OpenAI Chat Completions
 * protocol: xAI Grok, OpenAI, DeepSeek, Groq, OpenRouter, a local Ollama…
 * Like the Claude adapter it sends only the task's system prompt and escaped
 * data; the gateway parses, validates and grounds the text that comes back.
 */
export class OpenAiCompatibleProvider implements AiProvider {
  readonly name: string;
  readonly #endpoint: string;
  readonly #apiKey: string;
  readonly #model: string;

  constructor(options: OpenAiCompatibleOptions) {
    this.name = options.name;
    this.#endpoint = `${options.baseUrl.replace(/\/+$/, "")}/chat/completions`;
    this.#apiKey = options.apiKey;
    this.#model = options.model;
  }

  async complete(request: AiCompletionRequest, signal: AbortSignal): Promise<AiCompletion> {
    const response = await fetch(this.#endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.#apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.#model,
        max_tokens: request.maxOutputTokens,
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.prompt },
        ],
      }),
      signal,
    });
    if (!response.ok) {
      // The body may echo the request; only the status is safe to log.
      throw new OpenAiCompatibleNoAnswer(`HTTP ${response.status}`);
    }
    const completion = (await response.json()) as ChatCompletion;
    const choice = completion.choices?.[0];
    if (choice?.finish_reason === "length") throw new OpenAiCompatibleNoAnswer("length");
    const text = choice?.message?.content?.trim() ?? "";
    if (text === "") throw new OpenAiCompatibleNoAnswer("empty");
    const usage = completion.usage;
    return {
      text,
      model: completion.model ?? this.#model,
      ...(usage?.prompt_tokens !== undefined && usage.completion_tokens !== undefined
        ? { usage: { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens } }
        : {}),
    };
  }
}
