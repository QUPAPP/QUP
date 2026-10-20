"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";

import { Icon } from "@/components/icon";
import { PageHeading } from "@/components/page-heading";
import { ErrorNotice, Loading } from "@/components/status";
import { getReassessmentResult, getSession, type ReassessmentResult } from "@/lib/api";
import { answersText } from "@/lib/mastery-labels";
import { useRequireUser } from "@/lib/session";

/** The outcome of a skill reassessment (ADAPTIVE_ENGINE.md §13). Every figure is the API's. */
export default function ReassessmentResultPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const user = useRequireUser();
  const result = useQuery({
    queryKey: ["reassessment-result", user?.id, sessionId],
    queryFn: () => getReassessmentResult(sessionId),
    enabled: user !== null,
  });
  const session = useQuery({
    queryKey: ["session", user?.id, sessionId],
    queryFn: () => getSession(sessionId),
    enabled: user !== null,
  });
  const examId = session.data?.examId;

  return (
    <main id="main-content" className="page page--focused stack stack--loose">
      <PageHeading
        title="نتيجة إعادة القياس"
        description="خمسة أسئلة تتحقق من إتقانك للمهارة قبل أن تنتقل إلى المتقنة."
      />
      {result.isPending ? <Loading label="جارٍ حساب النتيجة…" /> : null}
      {result.isError ? <ErrorNotice error={result.error} /> : null}
      {result.data ? <Outcome result={result.data} examId={examId} /> : null}
    </main>
  );
}

function Outcome({ result, examId }: { result: ReassessmentResult; examId: string | undefined }) {
  return (
    <section className="card stack" aria-live="polite">
      <h2>{result.skill.name}</h2>
      <p>
        <bdi dir="ltr">
          {result.correct} / {result.total}
        </bdi>{" "}
        إجابة صحيحة — المطلوب {result.requiredCorrect} على الأقل.
      </p>
      {result.passed ? (
        <p className="notice notice--success" role="status">
          أتقنت المهارة. انتقلت إلى المهارات المتقنة، ولن يعود التدريب إليها.
        </p>
      ) : (
        <p className="notice" role="status">
          {result.remainingAttempts
            ? `لم تكتمل شروط الإتقان هذه المرة. تدرّب عليها: باقي ${answersText(result.remainingAttempts)} قبل أن تعيد المحاولة.`
            : "لم تكتمل شروط الإتقان هذه المرة. تابع التدريب عليها ثم أعد المحاولة."}
        </p>
      )}
      {examId ? (
        <div className="row">
          <Link href={`/exams/${examId}/profile`} className="btn">
            ملف مهاراتي
          </Link>
          {result.passed ? null : (
            <Link href={`/exams/${examId}/training`} className="text-link">
              التدريب <Icon name="arrow" />
            </Link>
          )}
        </div>
      ) : null}
    </section>
  );
}
