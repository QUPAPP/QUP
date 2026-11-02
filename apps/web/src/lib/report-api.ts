/** Question reports: students flag a problem; reviewers resolve or dismiss it. */

import { api } from "./api";

export type ReportReason = "WRONG_ANSWER" | "UNCLEAR_QUESTION" | "TYPO" | "OTHER";
export type ReportStatus = "OPEN" | "RESOLVED" | "DISMISSED";

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: "WRONG_ANSWER", label: "الإجابة المعتمدة خاطئة" },
  { value: "UNCLEAR_QUESTION", label: "السؤال غير واضح" },
  { value: "TYPO", label: "خطأ إملائي أو في الرموز" },
  { value: "OTHER", label: "مشكلة أخرى" },
];

export const REPORT_REASON_LABELS = Object.fromEntries(
  REPORT_REASONS.map((reason) => [reason.value, reason.label]),
) as Record<ReportReason, string>;

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  OPEN: "مفتوح",
  RESOLVED: "تم الإصلاح",
  DISMISSED: "لا مشكلة",
};

export interface AdminReport {
  id: string;
  questionId: string;
  questionVersionId: string;
  reason: ReportReason;
  note: string | null;
  status: ReportStatus;
  resolutionNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
  stemPreview: string;
  reporter: { email: string | null; displayName: string | null };
}

export const reportQuestion = (
  sessionId: string,
  itemId: string,
  body: { reason: ReportReason; note?: string },
) =>
  api<{ id: string; status: ReportStatus }>(`/assessments/${sessionId}/items/${itemId}/reports`, {
    method: "POST",
    body,
  });

export const listQuestionReports = (query: {
  status: ReportStatus | null;
  limit: number;
  offset: number;
}) =>
  api<{
    items: AdminReport[];
    openCount: number;
    page: { limit: number; offset: number; hasMore: boolean };
  }>(
    `/admin/question-reports?limit=${query.limit}&offset=${query.offset}${query.status ? `&status=${query.status}` : ""}`,
  );

export const closeQuestionReport = (
  id: string,
  body: { status: Exclude<ReportStatus, "OPEN">; note?: string },
) => api<AdminReport>(`/admin/question-reports/${id}/close`, { method: "POST", body });
