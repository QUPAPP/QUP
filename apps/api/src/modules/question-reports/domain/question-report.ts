export const REPORT_REASONS = ["WRONG_ANSWER", "UNCLEAR_QUESTION", "TYPO", "OTHER"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_STATUSES = ["OPEN", "RESOLVED", "DISMISSED"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];
export type ReportClosing = Exclude<ReportStatus, "OPEN">;

export const REPORT_NOTE_MAX = 1000;

export interface QuestionReport {
  id: string;
  questionId: string;
  questionVersionId: string;
  reportedBy: string;
  reason: ReportReason;
  note: string | null;
  status: ReportStatus;
  resolutionNote: string | null;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
}

export interface NewReport {
  questionId: string;
  questionVersionId: string;
  reportedBy: string;
  reason: ReportReason;
  note: string | null;
}

export interface ReportStore {
  /** Creates the report, or returns the student's open one on the same version untouched. */
  openOnce(report: NewReport): Promise<{ report: QuestionReport; created: boolean }>;
  find(id: string): Promise<QuestionReport | null>;
  list(query: {
    status: ReportStatus | null;
    limit: number;
    offset: number;
  }): Promise<{ items: QuestionReport[]; hasMore: boolean }>;
  /** Reports still open, for the admin overview. */
  openCount(): Promise<number>;
  /** Closes an open report; null when it was no longer open. */
  close(
    id: string,
    closing: { status: ReportClosing; note: string | null; by: string },
  ): Promise<QuestionReport | null>;
}

export const REPORT_STORE = Symbol("REPORT_STORE");
