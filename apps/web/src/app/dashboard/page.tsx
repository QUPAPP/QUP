"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { AssessmentHistory, SESSION_STATUS_LABELS } from "@/components/assessment-history";
import {
  DashboardBanner,
  ExamTabs,
  FocusPanels,
  SkillMap,
  StandingCard,
  StandingMetrics,
} from "@/components/dashboard-overview";
import { Icon } from "@/components/icon";
import { ErrorNotice, Loading } from "@/components/status";
import { getDashboard, isApiError, listAssessmentHistory, type SessionStatus } from "@/lib/api";
import { useCurrentUser, useRequireUser } from "@/lib/session";

const PAGE_SIZE = 10;

export default function DashboardPage() {
  const user = useRequireUser();
  const identity = useCurrentUser();
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState<SessionStatus | "">("");
  const [chosenExamId, setChosenExamId] = useState<string | null>(null);
  const history = useQuery({
    queryKey: ["assessment-history", user?.id, status, offset],
    queryFn: () =>
      listAssessmentHistory({ limit: PAGE_SIZE, offset, ...(status ? { status } : {}) }),
    enabled: user !== null,
  });
  const dashboard = useQuery({
    queryKey: ["dashboard", user?.id],
    queryFn: getDashboard,
    enabled: user !== null,
  });

  const exams = dashboard.data?.exams ?? [];
  const selected = exams.find((item) => item.exam.id === chosenExamId) ?? exams[0];

  return (
    <main id="main-content" className="page page--wide dash">
      <div className="dash-top">
        <DashboardBanner progress={selected} />
        {selected ? <StandingCard progress={selected} /> : null}
        {dashboard.isSuccess && !selected ? (
          <section className="dash-card standing standing--locked" aria-labelledby="start-title">
            <p className="eyebrow">خطوتك الأولى</p>
            <h2 id="start-title">اختر اختبارك وابدأ</h2>
            <p className="muted small">
              التشخيص المصغّر مجاني، ويعطيك صورة أولى عن مستواك في كل قسم.
            </p>
            <div className="standing__actions">
              <Link href="/exams" className="btn">
                استكشف الاختبارات <Icon name="arrow" />
              </Link>
            </div>
          </section>
        ) : null}
      </div>

      {dashboard.isPending && user ? <Loading /> : null}
      {dashboard.isError ? <ErrorNotice error={dashboard.error} /> : null}

      {selected ? (
        <>
          <div className="dash-section-head">
            <h2>
              {selected.standing ? "ملخص مستواك في" : "اختبارك:"} {selected.exam.nameAr}
            </h2>
            <ExamTabs
              exams={exams}
              selectedId={selected.exam.id}
              onSelect={(examId) => setChosenExamId(examId)}
            />
          </div>
          <StandingMetrics progress={selected} />
          {selected.standing ? (
            <div className="dash-grid">
              <SkillMap examId={selected.exam.id} />
              <FocusPanels progress={selected} />
            </div>
          ) : null}
        </>
      ) : null}

      <section className="history-panel" aria-labelledby="history-heading">
        <div className="history-toolbar">
          <h2 id="history-heading">
            <Icon name="clock" />
            آخر نشاطاتك
          </h2>
          <div className="history-filter">
            <label htmlFor="session-status">حالة الجلسة</label>
            <select
              id="session-status"
              className="field__input"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as SessionStatus | "");
                setOffset(0);
              }}
            >
              <option value="">كل الجلسات</option>
              {Object.entries(SESSION_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {identity.isError ? <ErrorNotice error={identity.error} /> : null}
        {!identity.isError && history.isPending ? <Loading /> : null}
        {history.isError ? (
          <ErrorNotice error={history.error}>
            {isApiError(history.error, "UNAUTHENTICATED") ? (
              <Link href="/login">تسجيل الدخول مجددًا</Link>
            ) : (
              <button type="button" className="btn btn--ghost" onClick={() => history.refetch()}>
                إعادة المحاولة
              </button>
            )}
          </ErrorNotice>
        ) : null}
        {user && !identity.isError && history.isSuccess ? (
          <AssessmentHistory items={history.data.items} />
        ) : null}
        <nav className="pagination" aria-label="صفحات سجل الجلسات">
          <button
            type="button"
            className="btn btn--ghost btn--small"
            disabled={offset === 0 || history.isFetching}
            onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}
          >
            السابق
          </button>
          <span className="small" aria-live="polite">
            الصفحة {Math.floor(offset / PAGE_SIZE) + 1}
          </span>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            disabled={!history.data?.page.hasMore || history.isFetching || history.isError}
            onClick={() => setOffset((value) => value + PAGE_SIZE)}
          >
            التالي
          </button>
        </nav>
      </section>
    </main>
  );
}
