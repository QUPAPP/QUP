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
}

export const AI_RUN_STORE = Symbol("AI_RUN_STORE");
