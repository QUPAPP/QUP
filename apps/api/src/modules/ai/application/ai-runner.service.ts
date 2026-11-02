import { Inject, Injectable } from "@nestjs/common";
import { type AiProvider, type AiRunStatus, type AiTask, runAiTask } from "@qup/ai-gateway";

import { APP_CONFIG, type AppConfig } from "../../../config/app-config.js";
import { AI_PROVIDER } from "../ai.contract.js";
import { AiOutputInvalid, AiTimedOut, AiUnavailable } from "../domain/ai.errors.js";
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
