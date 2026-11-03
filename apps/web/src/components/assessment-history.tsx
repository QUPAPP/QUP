import Link from "next/link";
import type { SessionHistoryEntry, SessionStatus, SessionType } from "@/lib/api";
import { COMPLETION_LABELS, completionHref, isRunnable } from "@/lib/diagnostics";
import { countText, formatDate, QUESTIONS } from "@/lib/format";
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
  MOCK_EXAM: "اختبار محاكٍ",
};
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
          <div className="history-detail">
            <div className="row">
              <h3>{SESSION_TYPE_LABELS[session.type]}</h3>
              <span className={`status-badge status-badge--${session.status.toLowerCase()}`}>
                {SESSION_STATUS_LABELS[session.status]}
              </span>
            </div>
            <p className="small muted">
              {session.exam.nameAr} ·{" "}
              <time dateTime={session.createdAt}>{formatDate(new Date(session.createdAt))}</time>
            </p>
          </div>
          <div className="history-progress">
            {session.status === "COMPLETED" ? (
              <p>{countText(session.progress.total, QUESTIONS)}</p>
            ) : (
              <>
                <p>
                  أجبت عن {session.progress.answered} من{" "}
                  {countText(session.progress.total, QUESTIONS)}
                </p>
                <div
                  className="progress"
                  role="progressbar"
                  aria-label={`التقدم في ${SESSION_TYPE_LABELS[session.type]}`}
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
              </>
            )}
          </div>
          <div className="history-action">
            {isRunnable(session.type) ? (
              session.status === "COMPLETED" ? (
                <Link
                  className="btn btn--ghost btn--small"
                  href={completionHref({ ...session, type: session.type })}
                >
                  {COMPLETION_LABELS[session.type]} <Icon name="chevron" />
                </Link>
              ) : session.status === "CREATED" || session.status === "IN_PROGRESS" ? (
                <Link className="btn btn--small" href={`/assessments/${session.id}`}>
                  أكمل الجلسة <Icon name="arrow" />
                </Link>
              ) : null
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
