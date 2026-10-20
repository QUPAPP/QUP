"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Icon } from "@/components/icon";
import { PageHeading } from "@/components/page-heading";
import { PlanOffers } from "@/components/plan-offers";
import { ErrorNotice, Loading } from "@/components/status";
import { getResult, getSession, type PreliminaryResult } from "@/lib/api";
import { useRequireUser } from "@/lib/session";

export default function ResultPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const user = useRequireUser();
  const result = useQuery({
    queryKey: ["result", user?.id, sessionId],
    queryFn: () => getResult(sessionId),
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
        title="نتيجتك المبدئية"
        description="بداية لفهم نقاط قوتك، وما يحتاج إلى مزيد من التركيز."
        action={
          <Link href="/dashboard" className="text-link">
            جلساتي ونتائجي السابقة <Icon name="chevron" />
          </Link>
        }
      />
      {result.isPending ? <Loading label="جارٍ حساب نتيجتك…" /> : null}
      {result.isError ? <ErrorNotice error={result.error} /> : null}
      {user && result.isSuccess ? (
        <>
          <Summary result={result.data} />
          {result.data.nextStep ? (
            <section className="stack stack--loose">
              <div>
                <h2>خطوتك التالية</h2>
                <p className="muted small">{result.data.nextStep.message}</p>
              </div>
              <p className="notice">
                بعد الاشتراك تكمل التشخيص الكامل من حيث توقفت، وتُحسب إجاباتك هنا. الباقات المعروضة
                أدناه تخص هذا الاختبار.
              </p>
              {session.isError ? (
                <ErrorNotice error={session.error} />
              ) : session.data ? (
                <PlanOffers examId={session.data.examId} />
              ) : (
                <Loading />
              )}
            </section>
          ) : session.data ? (
            <section className="notice notice--success stack">
              <p>أنت مشترك في هذا الاختبار. أكمل التشخيص الكامل ليظهر مستواك في كل مهارة.</p>
              <p>
                <Link href={`/exams/${session.data.examId}/full-diagnostic`} className="btn">
                  أكمل التشخيص الكامل <Icon name="arrow" />
                </Link>
              </p>
            </section>
          ) : null}
        </>
      ) : null}
      <p>
        <Link href="/exams" className="text-link">
          العودة إلى الاختبارات <Icon name="arrow" />
        </Link>
      </p>
    </main>
  );
}

function Summary({ result }: { result: PreliminaryResult }) {
  return (
    <>
      <section className="result-overview" aria-label="ملخص النتيجة">
        <div className="result-score">
          <strong>{result.score.percentage}%</strong>
          <p>
            <bdi dir="ltr">
              {result.score.correct} / {result.score.total}
            </bdi>{" "}
            إجابة صحيحة
          </p>
        </div>
        <div>
          <h2>خطوة أنجزتها، وصورة أوضح اكتشفتها.</h2>
          <p>
            المستوى التشخيصي: <span className="badge">{result.level.label}</span>
          </p>
          <p className="result-note">
            هذه قراءة أولية لأدائك في التشخيص المصغّر، وليست درجة متوقعة في الاختبار الرسمي.
          </p>
        </div>
      </section>
      <div className="result-columns">
        <section className="card stack">
          <div className="row">
            <Icon name="check" />
            <h2>نقاط القوة</h2>
          </div>
          {result.strengths.length ? (
            <ul className="list">
              {result.strengths.map((entry) => (
                <li className="list__item list__item--strength" key={entry.skill}>
                  <span>{entry.skill}</span>
                  <span>{entry.rating.label}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="small muted">لم تظهر نقاط قوة كافية في الإجابات المقاسة بعد.</p>
          )}
        </section>
        <section className="card stack">
          <div className="row">
            <Icon name="compass" />
            <h2>تحتاج إلى تدريب</h2>
          </div>
          {result.weaknesses.length ? (
            <ul className="list">
              {result.weaknesses.map((entry) => (
                <li className="list__item list__item--weakness" key={entry.skill}>
                  <span>{entry.skill}</span>
                  <span>{entry.rating.label}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="small muted">لا تظهر نقاط ضعف ضمن النتيجة المبدئية المتاحة.</p>
          )}
        </section>
      </div>
    </>
  );
}
