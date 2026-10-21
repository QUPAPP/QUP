"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { PageHeading } from "@/components/page-heading";
import { ErrorNotice, Loading } from "@/components/status";
import {
  type FullReassessmentStatus,
  getFullReassessmentStatus,
  startFullReassessment,
} from "@/lib/api";
import { gateText, waitingLines } from "@/lib/full-reassessment";
import { useRequireUser } from "@/lib/session";

/**
 * The full re-diagnostic (PRD §8): the whole exam measured again once the
 * gate allows. The API decides eligibility; this page explains it.
 */
export default function FullReassessmentPage() {
  const { examId } = useParams<{ examId: string }>();
  const user = useRequireUser();
  const status = useQuery({
    queryKey: ["full-reassessment-status", user?.id, examId],
    queryFn: () => getFullReassessmentStatus(examId),
    enabled: user !== null,
    staleTime: 0,
  });

  return (
    <main id="main-content" className="page page--focused stack stack--loose">
      <PageHeading
        title="إعادة التشخيص الشامل"
        description="تقيس الاختبار كله من جديد بأسئلة لم ترها قدر الإمكان، ثم تقارن نتيجتك بقياسك السابق مهارةً مهارة."
      />
      {status.isPending ? <Loading /> : null}
      {status.isError ? <ErrorNotice error={status.error} /> : null}
      {status.data ? <State examId={examId} status={status.data} /> : null}
    </main>
  );
}

function State({ examId, status }: { examId: string; status: FullReassessmentStatus }) {
  const router = useRouter();
  const start = useMutation({
    mutationFn: () => startFullReassessment(examId),
    onSuccess: (session) => router.push(`/assessments/${session.id}`),
  });

  switch (status.state) {
    case "OPEN":
      return (
        <section className="card stack">
          <p>بدأت إعادة التشخيص ولم تكملها بعد. تُحفظ كل إجابة، فتكمل من حيث توقفت.</p>
          <Link href={`/assessments/${status.openSessionId}`} className="btn">
            أكمل إعادة التشخيص <Icon name="arrow" />
          </Link>
        </section>
      );
    case "REQUIRES_ACCESS":
      return (
        <EmptyState
          icon="lock"
          title="إعادة التشخيص ضمن الباقة"
          description="اشترك في هذا الاختبار لتعيد قياس مستواك وتقارنه بقياسك السابق."
        >
          <Link href="/subscriptions" className="btn">
            عرض الباقات
          </Link>
        </EmptyState>
      );
    case "FULL_DIAGNOSTIC_REQUIRED":
      return (
        <EmptyState
          icon="compass"
          title="ابدأ بالتشخيص الكامل"
          description="إعادة التشخيص تقارن بقياس سابق، فالتشخيص الكامل يأتي أولًا."
        >
          <Link href={`/exams/${examId}/full-diagnostic`} className="btn">
            ابدأ التشخيص الكامل
          </Link>
        </EmptyState>
      );
    case "WAITING":
      return (
        <section className="card stack" aria-labelledby="waiting-heading">
          <h2 id="waiting-heading">ليست متاحة بعد</h2>
          <p className="small muted">
            {`${gateText(status.cooldownDays, status.trainingAttempts.required)} هكذا يظهر أثر تدريبك في القياس.`}
          </p>
          <ul className="stack">
            {waitingLines(status, new Date()).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <div className="row">
            <Link href={`/exams/${examId}/training`} className="btn">
              تابع التدريب <Icon name="arrow" />
            </Link>
            <Link href={`/exams/${examId}/profile`} className="text-link">
              ملف مهاراتي
            </Link>
          </div>
        </section>
      );
    case "ELIGIBLE":
      return (
        <section className="card stack" aria-labelledby="ready-heading">
          <h2 id="ready-heading">متاحة الآن</h2>
          <p>
            جلسة على كل مهارات الاختبار، بعدد أسئلة التشخيص الكامل وتوزيعه، وبأسئلة لم ترها قدر
            الإمكان. تُحتسب إجاباتك في مستواك كأي جلسة، وفي النهاية ترى مقارنة بقياسك السابق.
          </p>
          {start.isError ? <ErrorNotice error={start.error} /> : null}
          <button
            type="button"
            className="btn"
            disabled={start.isPending}
            onClick={() => start.mutate()}
          >
            {start.isPending ? "جارٍ التجهيز…" : "ابدأ إعادة التشخيص"}
          </button>
        </section>
      );
  }
}
