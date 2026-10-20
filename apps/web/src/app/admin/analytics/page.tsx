"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AdminGate } from "@/components/admin/admin-gate";
import { PageHeading } from "@/components/page-heading";
import { ErrorNotice, Loading } from "@/components/status";
import {
  type AnalyticsWindow,
  getContentMetrics,
  getImportMetrics,
  getLearningMetrics,
  getOutboxStatus,
} from "@/lib/admin-insights-api";
import { ANALYTICS_WINDOWS } from "@/lib/decision-labels";
import { BATCH_STATUS_LABELS } from "@/lib/import-mapping";
import { percentText } from "@/lib/mastery-labels";
import { ADMIN_PERMISSIONS } from "@/lib/permissions";

const QUESTION_STATUS_LABELS: Record<string, string> = {
  DRAFT: "مسودة",
  UNDER_REVIEW: "قيد المراجعة",
  APPROVED: "معتمد",
  PUBLISHED: "منشور",
  ARCHIVED: "مؤرشف",
};

export default function AdminAnalyticsPage() {
  return (
    <AdminGate permission={ADMIN_PERMISSIONS.auditView}>
      {(me) => <Analytics userId={me.user.id} />}
    </AdminGate>
  );
}

function Analytics({ userId }: { userId: string }) {
  const [days, setDays] = useState<AnalyticsWindow>(7);
  return (
    <main id="main-content" className="page stack stack--loose">
      <PageHeading
        title="المؤشرات"
        description="أرقام التعلّم من سجل الأحداث، والمحتوى والاستيراد من مصادرها، وحالة المعالجة في الخلفية."
        action={
          <fieldset className="segmented">
            <legend className="visually-hidden">الفترة</legend>
            {ANALYTICS_WINDOWS.map((window) => (
              <button
                key={window}
                type="button"
                className={`btn btn--small ${window === days ? "" : "btn--ghost"}`}
                aria-pressed={window === days}
                onClick={() => setDays(window)}
              >
                {`آخر ${window} يومًا`}
              </button>
            ))}
          </fieldset>
        }
      />
      <LearningCard userId={userId} days={days} />
      <ContentCard userId={userId} />
      <ImportsCard userId={userId} days={days} />
      <OutboxCard userId={userId} />
    </main>
  );
}

function Stats({ items }: { items: [string, string | number][] }) {
  return (
    <ul className="profile-summary">
      {items.map(([label, value]) => (
        <li key={label}>
          <strong>{value}</strong>
          <span>{label}</span>
        </li>
      ))}
    </ul>
  );
}

function LearningCard({ userId, days }: { userId: string; days: AnalyticsWindow }) {
  const learning = useQuery({
    queryKey: ["admin-analytics-learning", userId, days],
    queryFn: () => getLearningMetrics(days),
  });
  const data = learning.data;
  return (
    <section className="card stack" aria-labelledby="learning-heading">
      <h2 id="learning-heading">التعلّم</h2>
      {learning.isPending ? <Loading /> : null}
      {learning.isError ? <ErrorNotice error={learning.error} /> : null}
      {data ? (
        <Stats
          items={[
            ["طلاب نشطون", data.activeStudents],
            [
              "تشخيص مصغّر بدأ / اكتمل",
              `${data.diagnostics.miniStarted} / ${data.diagnostics.miniCompleted}`,
            ],
            [
              "تشخيص كامل بدأ / اكتمل",
              `${data.diagnostics.fullStarted} / ${data.diagnostics.fullCompleted}`,
            ],
            ["جلسات تدريب", data.trainingSessions],
            ["إجابات", data.attempts.answered],
            [
              "نسبة الصحيح",
              data.attempts.correctRate === null ? "—" : percentText(data.attempts.correctRate),
            ],
            ["تخطٍّ", data.attempts.skipped],
            [
              "إعادة قياس ناجحة / غير ناجحة",
              `${data.reassessments.passed} / ${data.reassessments.failed}`,
            ],
          ]}
        />
      ) : null}
      <p className="small muted">
        تُحسب من سجل أحداث التعلّم الذي تملؤه المعالجة في الخلفية؛ إن كانت متوقفة تتأخر الأرقام.
      </p>
    </section>
  );
}

function ContentCard({ userId }: { userId: string }) {
  const content = useQuery({
    queryKey: ["admin-analytics-content", userId],
    queryFn: getContentMetrics,
  });
  const data = content.data;
  return (
    <section className="card stack" aria-labelledby="content-heading">
      <h2 id="content-heading">بنك الأسئلة</h2>
      {content.isPending ? <Loading /> : null}
      {content.isError ? <ErrorNotice error={content.error} /> : null}
      {data ? (
        <>
          <Stats
            items={[
              ["بانتظار المراجعة أو النشر", data.reviewBacklog],
              ...Object.entries(QUESTION_STATUS_LABELS).map(([status, label]): [string, number] => [
                label,
                data.questions[status] ?? 0,
              ]),
            ]}
          />
          <h3>مهارات أسئلتها قليلة</h3>
          {data.thinSkills.length === 0 ? (
            <p className="small muted">كل مهارات الاختبارات النشطة لديها أسئلة كافية.</p>
          ) : (
            <ul className="list">
              {data.thinSkills.map((skill) => (
                <li
                  key={`${skill.examName}-${skill.skillName}`}
                  className="list__item list__item--weakness"
                >
                  <span>{`${skill.skillName} · ${skill.examName}`}</span>
                  <span className="small">{`${skill.published} منشورة`}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </section>
  );
}

function ImportsCard({ userId, days }: { userId: string; days: AnalyticsWindow }) {
  const imports = useQuery({
    queryKey: ["admin-analytics-imports", userId, days],
    queryFn: () => getImportMetrics(days),
  });
  const data = imports.data;
  return (
    <section className="card stack" aria-labelledby="imports-heading">
      <h2 id="imports-heading">الاستيراد</h2>
      {imports.isPending ? <Loading /> : null}
      {imports.isError ? <ErrorNotice error={imports.error} /> : null}
      {data ? (
        <>
          <Stats
            items={[
              ["صفوف أُنشئت مسوداتها", data.rows.imported],
              ["صفوف تحتاج تصحيحًا", data.rows.invalid],
              ["صفوف مكررة", data.rows.duplicate],
              ["صفوف متجاوزة", data.rows.skipped],
            ]}
          />
          {Object.keys(data.batches).length > 0 ? (
            <p className="small">
              {Object.entries(data.batches)
                .map(
                  ([status, count]) =>
                    `${BATCH_STATUS_LABELS[status as keyof typeof BATCH_STATUS_LABELS] ?? status}: ${count}`,
                )
                .join(" · ")}
            </p>
          ) : (
            <p className="small muted">لا ملفات في هذه الفترة.</p>
          )}
        </>
      ) : null}
    </section>
  );
}

function OutboxCard({ userId }: { userId: string }) {
  const outbox = useQuery({
    queryKey: ["admin-operations-outbox", userId],
    queryFn: getOutboxStatus,
  });
  const data = outbox.data;
  return (
    <section className="card stack" aria-labelledby="outbox-heading">
      <h2 id="outbox-heading">المعالجة في الخلفية</h2>
      {outbox.isPending ? <Loading /> : null}
      {outbox.isError ? <ErrorNotice error={outbox.error} /> : null}
      {data ? (
        <>
          <Stats
            items={[
              ["بانتظار المعالجة", data.pending],
              ["قيد المعالجة", data.processing],
              ["فشلت نهائيًا", data.failed],
              ["عولجت خلال 24 ساعة", data.published24h],
              [
                "عمر أقدم حدث منتظر",
                data.oldestPendingSeconds === null
                  ? "—"
                  : `${Math.round(data.oldestPendingSeconds / 60)} دقيقة`,
              ],
            ]}
          />
          {data.recentFailures.length > 0 ? (
            <ul className="list">
              {data.recentFailures.map((failure) => (
                <li key={failure.id} className="list__item list__item--weakness">
                  <span dir="ltr">{failure.eventType}</span>
                  <span className="small" dir="ltr">
                    {failure.lastError ?? ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
