import { Inject, Injectable } from "@nestjs/common";
import { type AiProvider, type AiRunStatus, type AiTask, runAiTask } from "@qup/ai-gateway";

import { APP_CONFIG, type AppConfig } from "../../../config/app-config.js";
import { AI_PROVIDER } from "../ai.contract.js";
import {
  AiOutputInvalid,
  AiRequestInProgress,
  AiTimedOut,
  AiUnavailable,
} from "../domain/ai.errors.js";
import { AI_RUN_STORE, type AiRunStore } from "../domain/ports.js";

export interface AiSubject {
  type: string;
  id: string;
}

function failure(status: Exclude<AiRunStatus, "SUCCEEDED">): Error {
  if (status === "INVALID_OUTPUT") return new AiOutputInvalid();
  if (status === "TIMED_OUT") return new AiTimedOut();
  return new AiUnavailable();
}

/**
 * Runs one gateway task with this deployment's limits and records it,
 * whatever its end (AI_INTEGRATION.md "Observability"). The one place the
 * module turns a failed run into a client-safe error.
 */
@Injectable()
export class AiRunner {
  /** Keys of the requests running now, e.g. one per student and task. */
  private readonly inFlight = new Set<string>();

  constructor(
    @Inject(AI_PROVIDER) private readonly provider: AiProvider | null,
    @Inject(AI_RUN_STORE) private readonly runs: AiRunStore,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  get providerName(): string | null {
    return this.provider?.name ?? null;
  }

  /** Throws AI_UNAVAILABLE before any work when AI is off. */
  assertAvailable(): void {
    if (!this.provider) throw new AiUnavailable();
  }

  /**
   * Runs `work` unless work under the same key is already running in this
   * process, which throws AI_REQUEST_IN_PROGRESS. Callers check their limits
   * inside `work`, so a burst of parallel requests cannot all pass one count.
   * Per process: with several API instances each would allow one at a time.
   */
  async exclusive<T>(key: string, work: () => Promise<T>): Promise<T> {
    if (this.inFlight.has(key)) throw new AiRequestInProgress();
    this.inFlight.add(key);
    try {
      return await work();
    } finally {
      this.inFlight.delete(key);
    }
  }

  async run<I, O>(
    task: AiTask<I, O>,
    input: I,
    subject: AiSubject,
    requestedBy: string | null,
  ): Promise<O> {
    if (!this.provider) throw new AiUnavailable();
    const result = await runAiTask(this.provider, task, input, {
      timeoutMs: this.config.ai.timeoutMs,
      maxAttempts: this.config.ai.maxAttempts,
    });
    await this.runs.record({
      ...result.run,
      requestedBy,
      subjectType: subject.type,
      subjectId: subject.id,
      output: result.ok ? result.output : null,
    });
    if (result.ok) return result.output;
    throw failure(result.run.status as Exclude<AiRunStatus, "SUCCEEDED">);
  }
}
