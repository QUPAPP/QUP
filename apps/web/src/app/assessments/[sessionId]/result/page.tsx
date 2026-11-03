"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Icon } from "@/components/icon";
import { PlanOffers } from "@/components/plan-offers";
import { SkillRow, StateWord } from "@/components/skill-row";
import { ErrorNotice, Loading } from "@/components/status";
import { getDashboard, getResult, getSession } from "@/lib/api";
import { nextStepLink } from "@/lib/next-step";
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
  const dashboard = useQuery({
    queryKey: ["dashboard", user?.id],
    queryFn: getDashboard,
    enabled: user !== null && result.data?.nextStep === null,
  });
  const examProgress = dashboard.data?.exams.find(
    (entry) => entry.exam.id === session.data?.examId,
  );
  const next = examProgress ? nextStepLink(examProgress.nextStep, examProgress.exam.id) : null;
  const subscribed = result.data?.nextStep === null;
  return (
    <main id="main-content" className="page result">
      {result.isPending ? <Loading label="جارٍ حساب نتيجتك…" /> : null}
      {result.isError ? <ErrorNotice error={result.error} /> : null}
      {user && result.isSuccess ? (
        <>
          <section className="verdict" aria-labelledby="verdict-title">
            <p className="eyebrow">نتيجتك المبدئية · التشخيص المصغّر</p>
            <h1 id="verdict-title">{`مستواك التشخيصي: ${result.data.level.label}`}</h1>
            <div className="verdict__row">
              <p className="verdict__score">
                <strong>
                  {result.data.score.correct}
                  <span>/{result.data.score.total}</span>
                </strong>
                <span>إجابة صحيحة</span>
              </p>
              <p className="verdict__note">
                قراءة أولية لأدائك في الأسئلة التي أجبت عنها، وليست درجة متوقعة في الاختبار الرسمي.
              </p>
            </div>
            <div className="verdict__actions">
              {subscribed && next ? (
                <Link href={next.href} className="btn btn--large">
                  {next.label} <Icon name="arrow" />
                </Link>
              ) : null}
              {!subscribed ? (
                <a href="#plans" className="btn btn--large">
                  أكمل التشخيص الكامل <Icon name="arrow" />
                </a>
              ) : null}
              {subscribed && session.data ? (
                <Link href={`/exams/${session.data.examId}/profile`} className="text-link">
                  ملف مهاراتي <Icon name="chevron" />
                </Link>
              ) : null}
            </div>
          </section>

          <div className="result-pair">
            <section className="panel" aria-labelledby="weak-title">
              <div className="panel__head">
                <h2 id="weak-title">تحتاج إلى تدريب</h2>
              </div>
              {result.data.weaknesses.length ? (
                <ol className="skill-rows">
                  {result.data.weaknesses.map((entry, index) => (
                    <SkillRow
                      key={entry.skill}
                      rank={index + 1}
                      name={entry.skill}
                      state={<StateWord tone="gap">{entry.rating.label}</StateWord>}
                    />
                  ))}
                </ol>
              ) : (
                <p className="panel__empty">لا تظهر نقاط ضعف ضمن النتيجة المبدئية المتاحة.</p>
              )}
            </section>
            <section className="panel" aria-labelledby="strong-title">
              <div className="panel__head">
                <h2 id="strong-title">نقاط القوة</h2>
              </div>
              {result.data.strengths.length ? (
                <ul className="skill-rows">
                  {result.data.strengths.map((entry) => (
                    <SkillRow
                      key={entry.skill}
                      name={entry.skill}
                      state={<StateWord tone="ready">{entry.rating.label}</StateWord>}
                    />
                  ))}
                </ul>
              ) : (
                <p className="panel__empty">لم تظهر نقاط قوة كافية في الإجابات المقاسة بعد.</p>
              )}
              <p className="panel__foot">
                الإتقان لا يُمنح من التشخيص المصغّر. يظهر الذهب على المهارة حين تثبتها بإعادة قياس.
              </p>
            </section>
          </div>

          {result.data.nextStep ? (
            <section className="result-plans" id="plans" aria-labelledby="plans-title">
              <div>
                <h2 id="plans-title">خطوتك التالية</h2>
                <p className="muted">{result.data.nextStep.message}</p>
                <p className="muted small">
                  بعد الاشتراك تكمل التشخيص الكامل من حيث توقفت، وتُحسب إجاباتك هنا. الباقات المعروضة
                  تخص هذا الاختبار.
                </p>
              </div>
              {session.isError ? (
                <ErrorNotice error={session.error} />
              ) : session.data ? (
                <PlanOffers examId={session.data.examId} />
              ) : (
                <Loading />
              )}
            </section>
          ) : null}
        </>
      ) : null}
      <p>
        <Link href="/dashboard" className="text-link text-link--back">
          العودة إلى لوحتك <Icon name="arrow" />
        </Link>
      </p>
    </main>
  );
}
