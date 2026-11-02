import type { AiRunRecord, AiRunStatus } from "@qup/ai-gateway";

/** What is about to be kept of one run (AI_INTEGRATION.md "Observability"). */
export interface AiRunEntry extends AiRunRecord {
  requestedBy: string | null;
  /** What the run was about, e.g. `question_version`. */
  subjectType: string;
  subjectId: string;
  /** The validated output of a successful run; null otherwise. Never the prompt. */
  output: unknown;
}

export interface StoredAiRun extends Omit<AiRunEntry, "output"> {
  id: string;
  createdAt: Date;
}

export interface AiRunStore {
  record(entry: AiRunEntry): Promise<void>;
  /** Newest first, without outputs. */
  recent(page: {
    limit: number;
    offset: number;
  }): Promise<{ items: StoredAiRun[]; hasMore: boolean }>;
  /** Runs per status since the given time; every status is present. */
  countsSince(since: Date): Promise<Record<AiRunStatus, number>>;
  /** The newest successful output of a task about a subject, asked by this person since a time. */
  latestOutput(query: {
    task: string;
    promptVersion: string;
    requestedBy: string;
    subjectType: string;
    subjectId: string;
    since: Date;
  }): Promise<unknown | null>;
  /** Runs of a task this person asked for since a time, whatever their end. */
  countByRequesterSince(task: string, requestedBy: string, since: Date): Promise<number>;
}

export const AI_RUN_STORE = Symbol("AI_RUN_STORE");
