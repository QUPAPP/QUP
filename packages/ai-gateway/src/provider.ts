/**
 * The one seam between QUP and a model vendor (AI_INTEGRATION.md "Provider
 * Strategy"). Adapters for real vendors implement this and stay outside the
 * domain; nothing else in QUP imports a vendor SDK.
 */

export interface AiCompletionRequest {
  /** The task's stable name, e.g. `suggest_question_metadata`. */
  task: string;
  system: string;
  prompt: string;
  /**
   * The task's structured input. Real providers send only `system` and
   * `prompt`; the test provider answers from this instead of parsing text.
   */
  input: unknown;
  maxOutputTokens: number;
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AiCompletion {
  text: string;
  model: string;
  usage?: AiUsage;
}

export interface AiProvider {
  readonly name: string;
  /** Must stop work when `signal` aborts; the gateway gives up on it either way. */
  complete(request: AiCompletionRequest, signal: AbortSignal): Promise<AiCompletion>;
}
