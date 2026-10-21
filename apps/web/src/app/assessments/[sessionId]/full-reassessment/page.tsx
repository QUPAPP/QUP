"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";

import { PageHeading } from "@/components/page-heading";
import { ErrorNotice, Loading } from "@/components/status";
import { type FullReassessmentResult, getFullReassessmentResult, getSession } from "@/lib/api";
import { DIAGNOSTIC_TITLES, SESSION_TITLES } from "@/lib/diagnostics";
import { accuracyText, changeText } from "@/lib/full-reassessment";
import { useRequireUser } from "@/lib/session";

const PREVIOUS_TITLES: Record<string, string> = {
  FULL_DIAGNOSTIC: DIAGNOSTIC_TITLES.FULL_DIAGNOSTIC,
  FULL_REASSESSMENT: SESSION_TITLES.FULL_REASSESSMENT,
};

/** The full re-diagnostic compared with the previous full measurement. Every figure is the API's. */
export default function FullReassessmentResultPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const user = useRequireUser();
  const result = useQuery({
    queryKey: ["full-reassessment-result", user?.id, sessionId],
    queryFn: () => getFullReassessmentResult(sessionId),
    enabled: user !== null,
  });
  const session = useQuery({
    queryKey: ["session", user?.id, sessionId],
    queryFn: () => getSession(sessionId),
    enabled: user !== null,
  });

  return (
    <main id="main-content" className="page stack stack--loose">
      <PageHeading
        title="نتيجة إعادة التشخيص"
        description="نسبة الإجابات الصحيحة الآن وفي قياسك السابق. مستواك الدقيق في كل مهارة في ملف مهاراتك."
      />
      {result.isPending ? <Loading label="جارٍ حساب المقارنة…" /> : null}
      {result.isError ? <ErrorNotice error={result.error} /> : null}
      {result.data ? <Comparison result={result.data} /> : null}
      {session.data ? (
        <div className="row">
          <Link href={`/exams/${session.data.examId}/profile`} className="btn">
            ملف مهاراتي
          </Link>
          <Link href="/dashboard" className="text-link">
            جلساتي
          </Link>
        </div>
      ) : null}
    </main>
  );
}

function Comparison({ result }: { result: FullReassessmentResult }) {
  const { score, previous } = result;
  return (
    <>
      <ul className="profile-summary" aria-label="النتيجة الإجمالية">
        <li>
          <strong>{accuracyText(score.correct, score.total)}</strong>
          <span>{`الآن: ${score.correct} من ${score.total} صحيحة`}</span>
        </li>
        {previous ? (
          <li>
            <strong>{accuracyText(previous.correct, previous.total)}</strong>
            <span>
              {`${PREVIOUS_TITLES[previous.type] ?? "القياس السابق"} — ${new Date(previous.completedAt).toLocaleDateString("ar-SA")}`}
            </span>
          </li>
        ) : null}
      </ul>

      <section className="card stack" aria-labelledby="skills-heading">
        <h2 id="skills-heading">حسب المهارة</h2>
        <ul className="list">
          {result.skills.map((skill) => (
            <li key={skill.skillId} className="list__item comparison-row">
              <strong>{skill.name}</strong>
              <span className="small">
                {`الآن ${accuracyText(skill.correct, skill.total)}`}
                {previous && skill.previousTotal !== null
                  ? ` · سابقًا ${accuracyText(skill.previousCorrect ?? 0, skill.previousTotal)}`
                  : ""}
              </span>
              {previous ? <span className="small muted">{changeText(skill)}</span> : null}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
