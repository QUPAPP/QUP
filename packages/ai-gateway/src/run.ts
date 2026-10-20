import { parseJsonOutput } from "./prompt.js";
import type { AiCompletion, AiProvider } from "./provider.js";
import type { AiTask } from "./task.js";

/** AI_INTEGRATION.md "Fallback": how one run ended. */
export const AI_RUN_STATUSES = ["SUCCEEDED", "INVALID_OUTPUT", "TIMED_OUT", "FAILED"] as const;
export type AiRunStatus = (typeof AI_RUN_STATUSES)[number];

/** AI_INTEGRATION.md "Observability": what is kept about a run. Never the prompt itself. */
export interface AiRunRecord {
  task: string;
  promptVersion: string;
  schemaVersion: string;
  provider: string;
  /** The model that answered last; null when none answered. */
  model: string | null;
  status: AiRunStatus;
  attempts: number;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  /** INVALID_JSON, SCHEMA_MISMATCH, a task's verify code, TIMEOUT or PROVIDER_ERROR. */
  errorCode: string | null;
}

export type AiRunResult<O> =
  | { ok: true; output: O; run: AiRunRecord }
  | { ok: false; run: AiRunRecord };

export interface AiRunOptions {
  /** Per attempt; the attempt is aborted when it runs out. */
  timeoutMs: number;
  /** Attempts for output that is not JSON, breaks the schema or fails the task's check. */
  maxAttempts: number;
}

class AttemptTimedOut extends Error {}

/** Runs one attempt with its own abort signal; a provider that ignores the abort is abandoned. */
async function attempt(
  start: (signal: AbortSignal) => Promise<AiCompletion>,
  timeoutMs: number,
): Promise<AiCompletion> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AttemptTimedOut());
    }, timeoutMs);
  });
  try {
    return await Promise.race([start(controller.signal), deadline]);
  } catch (error) {
    // Whatever the provider threw once aborted, the cause was the deadline.
    throw controller.signal.aborted ? new AttemptTimedOut() : error;
  } finally {
    clearTimeout(timer);
  }
}

type Checked<O> = { ok: true; output: O } | { ok: false; problem: string };

function check<I, O>(task: AiTask<I, O>, text: string, input: I): Checked<O> {
  const parsed = parseJsonOutput(text);
  if (!parsed.ok) return { ok: false, problem: "INVALID_JSON" };
  const shaped = task.schema.safeParse(parsed.value);
  if (!shaped.success) return { ok: false, problem: "SCHEMA_MISMATCH" };
  const problem = task.verify(shaped.data, input);
  return problem === null ? { ok: true, output: shaped.data } : { ok: false, problem };
}

/**
 * Runs a task through a provider (AI_INTEGRATION.md "Structured Output"):
 * JSON only, validated by the task's schema and its grounding check, retried
 * a bounded number of times. Timeouts and provider errors are not retried.
 */
export async function runAiTask<I, O>(
  provider: AiProvider,
  task: AiTask<I, O>,
  input: I,
  options: AiRunOptions,
): Promise<AiRunResult<O>> {
  if (!(options.maxAttempts >= 1 && options.timeoutMs > 0)) {
    throw new RangeError("AI runs need at least one attempt and a positive timeout");
  }
  const started = performance.now();
  const { system, prompt } = task.buildPrompt(input);
  let attempts = 0;
  let model: string | null = null;
  // Summed over attempts; stays null when the provider reports no usage.
  const usage: { inputTokens: number | null; outputTokens: number | null } = {
    inputTokens: null,
    outputTokens: null,
  };
  let problem = "INVALID_JSON";

  const record = (status: AiRunStatus, errorCode: string | null): AiRunRecord => ({
    task: task.name,
    promptVersion: task.promptVersion,
    schemaVersion: task.schemaVersion,
    provider: provider.name,
    model,
    status,
    attempts,
    latencyMs: Math.round(performance.now() - started),
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    errorCode,
  });

  while (attempts < options.maxAttempts) {
    attempts += 1;
    let completion: AiCompletion;
    try {
      completion = await attempt(
        (signal) =>
          provider.complete(
            { task: task.name, system, prompt, input, maxOutputTokens: task.maxOutputTokens },
            signal,
          ),
        options.timeoutMs,
      );
    } catch (error) {
      return error instanceof AttemptTimedOut
        ? { ok: false, run: record("TIMED_OUT", "TIMEOUT") }
        : { ok: false, run: record("FAILED", "PROVIDER_ERROR") };
    }
    model = completion.model;
    if (completion.usage) {
      usage.inputTokens = (usage.inputTokens ?? 0) + completion.usage.inputTokens;
      usage.outputTokens = (usage.outputTokens ?? 0) + completion.usage.outputTokens;
    }
    const checked = check(task, completion.text, input);
    if (checked.ok) return { ok: true, output: checked.output, run: record("SUCCEEDED", null) };
    problem = checked.problem;
  }
  return { ok: false, run: record("INVALID_OUTPUT", problem) };
}
