"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { AdminGate } from "@/components/admin/admin-gate";
import { EmptyState } from "@/components/empty-state";
import { PageHeading } from "@/components/page-heading";
import { ErrorNotice, Loading } from "@/components/status";
import { formatDateTime } from "@/lib/format";
import { ADMIN_PERMISSIONS } from "@/lib/permissions";
import {
  type AdminReport,
  closeQuestionReport,
  listQuestionReports,
  REPORT_REASON_LABELS,
  REPORT_STATUS_LABELS,
  type ReportStatus,
} from "@/lib/report-api";

const PAGE_SIZE = 30;
const FILTERS: { value: ReportStatus | null; label: string }[] = [
  { value: "OPEN", label: "المفتوحة" },
  { value: "RESOLVED", label: "تم إصلاحها" },
  { value: "DISMISSED", label: "لا مشكلة" },
  { value: null, label: "الكل" },
];

export default function QuestionReportsPage() {
  return (
    <AdminGate permission={ADMIN_PERMISSIONS.questionsReview}>
      {(me) => <Reports userId={me.user.id} />}
    </AdminGate>
  );
}

function Reports({ userId }: { userId: string }) {
  const [status, setStatus] = useState<ReportStatus | null>("OPEN");
  const [offset, setOffset] = useState(0);
  const reports = useQuery({
    queryKey: ["question-reports", userId, status, offset],
    queryFn: () => listQuestionReports({ status, limit: PAGE_SIZE, offset }),
    placeholderData: keepPreviousData,
  });

  return (
    <main id="main-content" className="page stack stack--loose">
      <PageHeading
        title="بلاغات الأسئلة"
        description="ما أبلغ عنه الطلاب: إجابة معتمدة خاطئة، أو صياغة غير واضحة، أو خطأ إملائي. أصلح السؤال في نسخة جديدة، ثم أغلق البلاغ."
      />
      <section className="card stack" aria-label="البلاغات">
        <fieldset className="row">
          <legend className="visually-hidden">تصفية حسب الحالة</legend>
          <div className="chip-group">
            {FILTERS.map((filter) => (
              <button
                key={filter.label}
                type="button"
                className="chip"
                aria-pressed={status === filter.value}
                onClick={() => {
                  setStatus(filter.value);
                  setOffset(0);
                }}
              >
                {filter.label}
                {filter.value === "OPEN" && reports.data ? ` (${reports.data.openCount})` : ""}
              </button>
            ))}
          </div>
        </fieldset>
        {reports.isPending ? <Loading /> : null}
        {reports.isError ? <ErrorNotice error={reports.error} /> : null}
        {reports.data?.items.length === 0 ? (
          <EmptyState
            icon="check"
            title="لا بلاغات هنا"
            description="حين يبلّغ طالب عن مشكلة في سؤال، يظهر بلاغه في هذه القائمة."
          />
        ) : null}
        {reports.data && reports.data.items.length > 0 ? (
          <ul className="list">
            {reports.data.items.map((report) => (
              <ReportEntry key={report.id} report={report} userId={userId} />
            ))}
          </ul>
        ) : null}
        <nav className="pagination" aria-label="صفحات البلاغات">
          <button
            type="button"
            className="btn btn--ghost"
            disabled={offset === 0 || reports.isFetching}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            الأحدث
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={!reports.data?.page.hasMore || reports.isFetching}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            الأقدم
          </button>
        </nav>
      </section>
    </main>
  );
}

function ReportEntry({ report, userId }: { report: AdminReport; userId: string }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const close = useMutation({
    mutationFn: (status: "RESOLVED" | "DISMISSED") =>
      closeQuestionReport(report.id, { status, ...(note.trim() ? { note: note.trim() } : {}) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["question-reports", userId] }),
  });
  const reporter = report.reporter.displayName ?? report.reporter.email ?? "طالب";

  return (
    <li className="audit-entry stack">
      <div className="audit-entry__head">
        <strong>{REPORT_REASON_LABELS[report.reason]}</strong>
        <span className="badge">{REPORT_STATUS_LABELS[report.status]}</span>
        <span className="small muted">{formatDateTime(report.createdAt)}</span>
      </div>
      <p className="small">«{report.stemPreview}…»</p>
      {report.note ? <p className="small">ملاحظة الطالب: {report.note}</p> : null}
      <span className="small muted">
        {reporter} ·{" "}
        <Link href={`/admin/question-versions/${report.questionVersionId}`}>فتح نسخة السؤال</Link>
      </span>
      {report.resolutionNote ? (
        <p className="small muted">ملاحظة المراجعة: {report.resolutionNote}</p>
      ) : null}
      {report.status === "OPEN" ? (
        <div className="stack">
          <label className="visually-hidden" htmlFor={`note-${report.id}`}>
            ملاحظة الإغلاق
          </label>
          <input
            id={`note-${report.id}`}
            className="field__input"
            placeholder="ملاحظة الإغلاق (اختياري)"
            maxLength={1000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          {close.isError ? <ErrorNotice error={close.error} /> : null}
          <div className="row">
            <button
              type="button"
              className="btn btn--small"
              disabled={close.isPending}
              onClick={() => close.mutate("RESOLVED")}
            >
              تم الإصلاح
            </button>
            <button
              type="button"
              className="btn btn--small btn--ghost"
              disabled={close.isPending}
              onClick={() => close.mutate("DISMISSED")}
            >
              لا توجد مشكلة
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
