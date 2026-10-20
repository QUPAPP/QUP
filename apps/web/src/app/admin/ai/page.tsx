"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { AdminGate } from "@/components/admin/admin-gate";
import { PageHeading } from "@/components/page-heading";
import { ErrorNotice, Loading } from "@/components/status";
import { type AiRunStatus, getAiStatus, listAiRuns } from "@/lib/ai-api";
import { AI_STATUS_LABELS, AI_TASK_LABELS } from "@/lib/ai-assist";
import { ADMIN_PERMISSIONS } from "@/lib/permissions";

const PAGE_SIZE = 50;
const STATUS_ORDER: AiRunStatus[] = ["SUCCEEDED", "INVALID_OUTPUT", "TIMED_OUT", "FAILED"];

export default function AdminAiPage() {
  return (
    <AdminGate permission={ADMIN_PERMISSIONS.aiManage}>
      {(me) => <AiRuns userId={me.user.id} />}
    </AdminGate>
  );
}

function AiRuns({ userId }: { userId: string }) {
  const [offset, setOffset] = useState(0);
  const status = useQuery({ queryKey: ["ai-status", userId], queryFn: getAiStatus });
  const runs = useQuery({
    queryKey: ["admin-ai-runs", userId, offset],
    queryFn: () => listAiRuns({ limit: PAGE_SIZE, offset }),
    placeholderData: keepPreviousData,
  });

  return (
    <main id="main-content" className="page stack stack--loose">
      <PageHeading
        title="الذكاء الاصطناعي"
        description="مساعدة كتّاب الأسئلة وسجل كل طلب: نتيجته وزمنه وعدد محاولاته. لا يُحفظ نص الطلب."
      />

      <section className="card stack" aria-labelledby="ai-status-heading">
        <h2 id="ai-status-heading">الحالة</h2>
        {status.isPending ? <Loading /> : null}
        {status.isError ? <ErrorNotice error={status.error} /> : null}
        {status.data ? (
          <p>
            {status.data.enabled
              ? status.data.provider === "fake"
                ? "المساعدة تعمل بمزوّد الاختبار: اقتراحات ثابتة للتجربة، لا نموذج حقيقي."
                : `المساعدة تعمل عبر ${status.data.provider}.`
              : "المساعدة متوقفة. محرر الأسئلة يعمل كالمعتاد دونها."}
          </p>
        ) : null}
        {runs.data ? (
          <ul className="profile-summary" aria-label="آخر 24 ساعة">
            {STATUS_ORDER.map((key) => (
              <li key={key}>
                <strong>{runs.data.last24h[key]}</strong>
                <span>{`${AI_STATUS_LABELS[key]} (24 ساعة)`}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="card stack" aria-labelledby="ai-runs-heading">
        <h2 id="ai-runs-heading">الطلبات الأخيرة</h2>
        {runs.isPending ? <Loading /> : null}
        {runs.isError ? <ErrorNotice error={runs.error} /> : null}
        {runs.data?.items.length === 0 ? <p className="muted">لا طلبات بعد.</p> : null}
        {runs.data && runs.data.items.length > 0 ? (
          <ul className="list">
            {runs.data.items.map((run) => (
              <li key={run.id} className="audit-entry">
                <div className="audit-entry__head">
                  <strong>{AI_TASK_LABELS[run.task] ?? run.task}</strong>
                  <span className="small muted">
                    {new Date(run.createdAt).toLocaleString("ar-SA")}
                  </span>
                </div>
                <span className="small">
                  {`${AI_STATUS_LABELS[run.status]}${run.errorCode ? ` · ${run.errorCode}` : ""} · ${run.latencyMs} م.ث · محاولات ${run.attempts}`}
                </span>
                <span className="small muted">
                  {`${run.requestedBy ? (run.requestedBy.displayName ?? run.requestedBy.email ?? "حساب بلا اسم") : "حساب غير متاح"} · `}
                  <bdi dir="ltr">{`${run.provider}/${run.model ?? "—"} · ${run.promptVersion}`}</bdi>
                  {run.subjectType === "question_version" ? (
                    <>
                      {" · "}
                      <Link href={`/admin/question-versions/${run.subjectId}`}>نسخة السؤال</Link>
                    </>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <nav className="pagination" aria-label="صفحات السجل">
          <button
            type="button"
            className="btn btn--ghost"
            disabled={offset === 0 || runs.isFetching}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            الأحدث
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={!runs.data?.page.hasMore || runs.isFetching}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            الأقدم
          </button>
        </nav>
      </section>
    </main>
  );
}
