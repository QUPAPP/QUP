import Link from "next/link";
import type { SessionHistoryEntry, SessionStatus, SessionType } from "@/lib/api";
import { completionHref, isRunnable } from "@/lib/diagnostics";
import { EmptyState } from "./empty-state";
import { Icon } from "./icon";

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  CREATED: "لم تبدأ بعد",
  IN_PROGRESS: "قيد الإكمال",
  COMPLETED: "مكتملة",
  ABANDONED: "متوقفة",
  EXPIRED: "منتهية المهلة",
};
const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  MINI_DIAGNOSTIC: "التشخيص المصغّر",
  FULL_DIAGNOSTIC: "التشخيص الكامل",
  PRACTICE: "تدريب",
  ADAPTIVE_TRAINING: "تدريب تكيفي",
  SKILL_REASSESSMENT: "إعادة قياس مهارة",
  FULL_REASSESSMENT: "إعادة القياس الشامل",
  MOCK_EXAM: "اختبار محاكي",
};
const dateFormat = new Intl.DateTimeFormat("ar-SA", {
  calendar: "gregory",
  dateStyle: "medium",
  timeZone: "Asia/Riyadh",
});
const PERCENT = 100;

export function AssessmentHistory({ items }: { items: SessionHistoryEntry[] }) {
  if (items.length === 0)
    return (
      <EmptyState
        title="هنا تبدأ رحلتك."
        description="لا توجد جلسات مطابقة. ابدأ تشخيصًا مصغّرًا من صفحة الاختبارات، وستجد جلساتك ونتائجك هنا."
        icon="compass"
      >
        <Link href="/exams" className="btn">
          استكشف الاختبارات <Icon name="arrow" />
        </Link>
      </EmptyState>
    );
  return (
    <ul className="history-list" aria-label="سجل الجلسات">
      {items.map((session) => (
        <li className="history-row" key={session.id}>
          <span className="item-symbol">
            <Icon name={session.status === "COMPLETED" ? "check" : "book"} />
          </span>
          <div className="history-detail">
            <div className="row">
              <h3>{session.exam.nameAr}</h3>
              <span className={`status-badge status-badge--${session.status.toLowerCase()}`}>
                {SESSION_STATUS_LABELS[session.status]}
              </span>
            </div>
            <p className="small muted">
              {SESSION_TYPE_LABELS[session.type]} ·{" "}
              <time dateTime={session.createdAt}>
                {dateFormat.format(new Date(session.createdAt))}
              </time>
            </p>
          </div>
          <div className="history-progress">
            <p>
              تم إنهاء {session.progress.answered} من {session.progress.total} سؤالًا
            </p>
            <div
              className="progress"
              role="progressbar"
              aria-label={`التقدم في ${session.exam.nameAr}`}
              aria-valuemin={0}
              aria-valuemax={session.progress.total || 1}
              aria-valuenow={session.progress.answered}
            >
              <div
                className="progress__bar"
                style={{
                  width: `${session.progress.total ? (session.progress.answered / session.progress.total) * PERCENT : 0}%`,
                }}
              />
            </div>
          </div>
          <div className="history-action">
            {isRunnable(session.type) ? (
              session.status === "COMPLETED" ? (
                <Link
                  className="btn btn--ghost btn--small"
                  href={completionHref({ ...session, type: session.type })}
                >
                  {session.type === "MINI_DIAGNOSTIC" ? "عرض النتيجة" : "ملف مهاراتي"}{" "}
                  <Icon name="chevron" />
                </Link>
              ) : session.status === "CREATED" || session.status === "IN_PROGRESS" ? (
                <Link className="btn btn--small" href={`/assessments/${session.id}`}>
                  استكمال التشخيص <Icon name="arrow" />
                </Link>
              ) : null
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
