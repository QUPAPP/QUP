import type { z } from "zod";

/**
 * One versioned AI use (AI_INTEGRATION.md "Prompt Versioning", "Structured
 * Output"). Changing the prompt or the schema means a new version, and every
 * run records both.
 */
export interface AiTask<I, O> {
  readonly name: string;
  readonly promptVersion: string;
  readonly schemaVersion: string;
  readonly schema: z.ZodType<O>;
  readonly maxOutputTokens: number;
  buildPrompt(input: I): { system: string; prompt: string };
  /**
   * A grounding check beyond the schema: the output must agree with facts the
   * caller already knows. Returns a problem code, or null when it agrees.
   */
  verify(output: O, input: I): string | null;
}
