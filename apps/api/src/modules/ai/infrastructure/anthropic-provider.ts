import Anthropic from "@anthropic-ai/sdk";
import type { AiCompletion, AiCompletionRequest, AiProvider } from "@qup/ai-gateway";

/** Tokens added to each task's answer budget so thinking cannot truncate the JSON. */
const THINKING_HEADROOM_TOKENS = 4000;

export type AnthropicEffort = "low" | "medium" | "high";

export interface AnthropicProviderOptions {
  apiKey: string;
  model: string;
  effort: AnthropicEffort;
  /** Override for tests and private gateways; the SDK default otherwise. */
  baseUrl?: string;
}

/** Refused or cut-off answers are not output; the gateway records them as provider errors. */
export class AnthropicNoAnswer extends Error {
  constructor(readonly stopReason: string | null) {
    super(`Claude stopped without a usable answer (${stopReason ?? "unknown"})`);
    this.name = "AnthropicNoAnswer";
  }
}

/**
 * The Claude adapter behind `AiProvider` (AI_INTEGRATION.md "Provider
 * Strategy"). Sends only the task's system prompt and escaped data prompt;
 * the gateway parses, validates and grounds whatever comes back.
 *
 * The SDK's own retries are off: the gateway owns attempts and timeouts, so a
 * slow vendor never multiplies the per-attempt deadline.
 */
export class AnthropicAiProvider implements AiProvider {
  readonly name = "anthropic";
  readonly #client: Anthropic;
  readonly #model: string;
  readonly #effort: AnthropicEffort;

  constructor(options: AnthropicProviderOptions) {
    this.#client = new Anthropic({
      apiKey: options.apiKey,
      maxRetries: 0,
      ...(options.baseUrl ? { baseURL: options.baseUrl } : {}),
    });
    this.#model = options.model;
    this.#effort = options.effort;
  }

  async complete(request: AiCompletionRequest, signal: AbortSignal): Promise<AiCompletion> {
    const response = await this.#client.beta.messages.create(
      {
        model: this.#model,
        // Room for adaptive thinking on top of the task's own answer budget.
        max_tokens: request.maxOutputTokens + THINKING_HEADROOM_TOKENS,
        output_config: { effort: this.#effort },
        // On a safety decline the API retries on a suitable model in the same call.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: request.system,
        messages: [{ role: "user", content: request.prompt }],
      },
      { signal },
    );

    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
      throw new AnthropicNoAnswer(response.stop_reason);
    }
    const text = response.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("")
      .trim();
    return {
      text,
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}
