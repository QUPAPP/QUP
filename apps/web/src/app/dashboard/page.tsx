"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { AssessmentHistory, SESSION_STATUS_LABELS } from "@/components/assessment-history";
import { Icon } from "@/components/icon";
import { PageHeading } from "@/components/page-heading";
import { ErrorNotice, Loading } from "@/components/status";
import { isApiError, listAssessmentHistory, type SessionStatus } from "@/lib/api";
import { useCurrentUser, useRequireUser } from "@/lib/session";

const PAGE_SIZE = 10;

export default function DashboardPage() {
  const user = useRequireUser();
  const identity = useCurrentUser();
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState<SessionStatus | "">("");
  const history = useQuery({
    queryKey: ["assessment-history", user?.id, status, offset],
    queryFn: () =>
      listAssessmentHistory({ limit: PAGE_SIZE, offset, ...(status ? { status } : {}) }),
    enabled: user !== null,
  });

  return (
    <main id="main-content" className="page stack stack--loose">
      <PageHeading
        title="جلساتي"
        description="مساحتك لكل بداية، وكل خطوة بعدها."
        action={
          <Link href="/exams" className="btn">
            <Icon name="plus" />
            اختيار اختبار
          </Link>
        }
      />
      <section className="welcome-panel">
        <div>
          <h2>{user?.displayName ? `أهلًا، ${user.displayName}.` : "أهلًا بك في رحلتك."}</h2>
          <p>استكمل تشخيصك من حيث توقفت، أو راجع نتائجك لتعرف ما تحتاج إلى التركيز عليه.</p>
        </div>
        <span className="welcome-panel-symbol">
          <Icon name="compass" />
        </span>
      </section>
      <section className="history-panel" aria-labelledby="history-heading">
        <div className="history-toolbar">
          <h2 id="history-heading">سجل التعلّم</h2>
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
            className="btn btn--ghost"
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
            className="btn btn--ghost"
            disabled={!history.data?.page.hasMore || history.isFetching || history.isError}
            onClick={() => setOffset((value) => value + PAGE_SIZE)}
          >
            التالي
          </button>
        </nav>
      </section>
      <aside className="info-panel">
        <Icon name="book" />
        <div>
          <h2>كل اختبار بداية مستقلة</h2>
          <p>
            اختر اختبارك، وابدأ بتشخيص مصغّر مجاني. ستبقى جلسات كل اختبار ونتائجه محفوظة في حسابك.
          </p>
        </div>
      </aside>
    </main>
  );
}
