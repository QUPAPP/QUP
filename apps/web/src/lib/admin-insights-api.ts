/**
 * Admin reads for metrics, the audit log and adaptive decisions
 * (API_CONTRACTS.md "Admin Analytics/Audit"). Display only: every number is
 * the API's.
 */

import { api } from "./api";

export type AnalyticsWindow = 7 | 30;

export interface LearningMetrics {
  days: number;
  activeStudents: number;
  diagnostics: {
    miniStarted: number;
    miniCompleted: number;
    fullStarted: number;
    fullCompleted: number;
  };
  trainingSessions: number;
  attempts: { answered: number; skipped: number; correctRate: number | null };
  reassessments: { passed: number; failed: number };
}

export interface ContentMetrics {
  questions: Record<string, number>;
  reviewBacklog: number;
  thinSkills: { examName: string; skillName: string; published: number }[];
}

export interface ImportMetrics {
  days: number;
  batches: Record<string, number>;
  rows: { imported: number; invalid: number; duplicate: number; skipped: number };
}

export interface OutboxStatus {
  pending: number;
  processing: number;
  failed: number;
  published24h: number;
  oldestPendingSeconds: number | null;
  recentFailures: {
    id: string;
    eventType: string;
    attempts: number;
    lastError: string | null;
    createdAt: string;
  }[];
}

export interface AuditEntry {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  actor: { id: string; email: string | null; displayName: string | null } | null;
  requestId: string | null;
  metadata: unknown;
  createdAt: string;
}

export interface AuditFilter {
  action: string;
  resourceType: string;
  limit: number;
  offset: number;
}

export interface SessionDecisions {
  session: {
    id: string;
    type: string;
    status: string;
    examId: string;
    examName: string;
    studentId: string;
    createdAt: string;
  };
  items: {
    itemOrdinal: number;
    answered: boolean;
    id: string;
    targetSkill: { id: string; name: string };
    masterySnapshot: number | null;
    confidenceSnapshot: number | null;
    targetDifficulty: number | null;
    reasons: string[];
    candidates: { questionVersionId: string; difficulty: number; score: number }[];
    selectedQuestionVersionId: string | null;
    engineVersion: string;
    configVersion: string;
    createdAt: string;
  }[];
}

export const getLearningMetrics = (days: AnalyticsWindow) =>
  api<LearningMetrics>(`/admin/analytics/learning?days=${days}`);

export const getContentMetrics = () => api<ContentMetrics>("/admin/analytics/content");

export const getImportMetrics = (days: AnalyticsWindow) =>
  api<ImportMetrics>(`/admin/analytics/imports?days=${days}`);

export const getOutboxStatus = () => api<OutboxStatus>("/admin/operations/outbox");

export const listAuditLogs = (filter: AuditFilter) => {
  const query = new URLSearchParams({ limit: String(filter.limit), offset: String(filter.offset) });
  if (filter.action.trim()) query.set("action", filter.action.trim());
  if (filter.resourceType.trim()) query.set("resourceType", filter.resourceType.trim());
  return api<{ items: AuditEntry[]; page: { limit: number; offset: number; hasMore: boolean } }>(
    `/admin/audit-logs?${query}`,
  );
};

export const getSessionDecisions = (sessionId: string) =>
  api<SessionDecisions>(`/admin/adaptive-decisions?sessionId=${encodeURIComponent(sessionId)}`);
