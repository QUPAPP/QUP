import Link from "next/link";

import type { ExamProgress } from "@/lib/api";
import { MASTERY_STATE_LABELS, percentText } from "@/lib/mastery-labels";
import { improvementText, nextStepLink } from "@/lib/next-step";
import { Icon } from "./icon";

/**
 * One exam on the dashboard (UI_BRAND.md "Student Dashboard Principle"): where
 * the student stands, strengths, gaps, this week's progress, and one primary
 * action. Every figure and the action itself come from the API.
 */
export function ExamProgressCard({ progress }: { progress: ExamProgress }) {
  const { exam, standing } = progress;
  const next = nextStepLink(progress.nextStep, exam.id);
  const headingId = `exam-progress-${exam.id}`;
  return (
    <section className="card stack exam-progress" aria-labelledby={headingId}>
      <div className="exam-progress__head">
        <h3 id={headingId}>{exam.nameAr}</h3>
        <Link href={next.href} className="btn">
          {next.label} <Icon name="arrow" />
        </Link>
      </div>

      {standing ? (
        <>
          <ul className="profile-summary" aria-label={`أين أنت في ${exam.nameAr}`}>
            <li>
              <strong>{`${standing.summary.assessed} / ${standing.summary.skills}`}</strong>
              <span>مهارات قيست</span>
            </li>
            <li>
              <strong>{standing.summary.gaps}</strong>
              <span>فجوات</span>
            </li>
            <li>
              <strong>{standing.summary.readyForReassessment}</strong>
              <span>جاهزة لإعادة القياس</span>
            </li>
            <li>
              <strong>{standing.summary.mastered}</strong>
              <span>متقنة</span>
            </li>
          </ul>

          <div className="exam-progress__columns">
            <div className="stack">
              <h4>نقاط قوتك</h4>
              {standing.strengths.length ? (
                <ul className="list">
                  {standing.strengths.map((strength) => (
                    <li key={strength.skillName} className="list__item list__item--strength">
                      <span>{strength.skillName}</span>
                      <span className="small">
                        {strength.state === "MASTERED"
                          ? MASTERY_STATE_LABELS.MASTERED
                          : percentText(strength.mastery)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="small muted">تظهر بعد أن نقيس مهاراتك أكثر.</p>
              )}
            </div>
            <div className="stack">
              <h4>أحوج المهارات إلى التدريب</h4>
              {standing.gaps.length ? (
                <ol className="list">
                  {standing.gaps.map((gap) => (
                    <li key={gap.skillName} className="list__item list__item--weakness">
                      <span>{gap.skillName}</span>
                      <span className="small">{MASTERY_STATE_LABELS.GAP}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="small muted">لا فجوات مقيسة الآن.</p>
              )}
            </div>
          </div>

          {standing.improvements.length ? (
            <div className="stack">
              <h4>تقدّمك هذا الأسبوع</h4>
              <ul className="list">
                {standing.improvements.map((change) => (
                  <li key={change.nodeName} className="list__item">
                    <span>{change.nodeName}</span>
                    <span className="small">
                      {`${percentText(change.before)} ← ${percentText(change.after)} (${improvementText(change.before, change.after)})`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <Link href={`/exams/${exam.id}/profile`} className="text-link">
            ملف مهاراتي الكامل <Icon name="chevron" />
          </Link>
        </>
      ) : (
        <p className="small muted">
          ملف المهارات الكامل والتدريب ضمن باقة هذا الاختبار؛ التشخيص المصغّر مجاني.
        </p>
      )}
    </section>
  );
}
