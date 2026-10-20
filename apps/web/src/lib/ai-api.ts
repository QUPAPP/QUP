/**
 * AI assistance for question authors and the AI run log (API_CONTRACTS.md
 * "AI Assistance"). Suggestions are advice the author may apply in the
 * editor; the API never writes them into a question.
 */

import { api } from "./api";

export type AiRunStatus = "SUCCEEDED" | "INVALID_OUTPUT" | "TIMED_OUT" | "FAILED";

export interface AiStatus {
  enabled: boolean;
  provider: string | null;
  tasks: string[];
}

export interface MetadataSuggestion {
  skillId: string | null;
  subskillId: string | null;
  nodeName: string;
  difficulty: number;
  rationale: string;
}

export interface AiRun {
  id: string;
  task: string;
  promptVersion: string;
  schemaVersion: string;
  provider: string;
  model: string | null;
  status: AiRunStatus;
  attempts: number;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  errorCode: string | null;
  requestedBy: { id: string; email: string | null; displayName: string | null } | null;
  subjectType: string;
  subjectId: string;
  createdAt: string;
}

export const getAiStatus = () => api<AiStatus>("/admin/ai/status");

export const requestMetadataSuggestion = (versionId: string) =>
  api<{ suggestion: MetadataSuggestion }>(
    `/admin/question-versions/${versionId}/ai/metadata-suggestion`,
    { method: "POST" },
  );

export const requestExplanationDraft = (versionId: string) =>
  api<{ draft: { explanation: string } }>(
    `/admin/question-versions/${versionId}/ai/explanation-draft`,
    { method: "POST" },
  );

export const listAiRuns = (page: { limit: number; offset: number }) =>
  api<{
    items: AiRun[];
    last24h: Record<AiRunStatus, number>;
    page: { limit: number; offset: number; hasMore: boolean };
  }>(`/admin/ai/runs?limit=${page.limit}&offset=${page.offset}`);
