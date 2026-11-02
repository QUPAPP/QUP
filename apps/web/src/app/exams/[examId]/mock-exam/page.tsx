"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { PageHeading } from "@/components/page-heading";
import { ErrorNotice } from "@/components/status";
import { isApiError, startMockExam } from "@/lib/api";
import { useRequireUser } from "@/lib/session";

/**
 * The mock exam's door: what to expect before the clock starts. The number
 * of questions and the time are the server's; they appear once it starts.
 */
export default function MockExamPage() {
  const { examId } = useParams<{ examId: string }>();
  const router = useRouter();
  const user = useRequireUser();
  const start = useMutation({
    mutationFn: () => startMockExam(examId),
    onSuccess: (session) => router.push(`/assessments/${session.id}`),
  });

  if (isApiError(start.error, "MOCK_EXAM_REQUIRES_ACCESS")) {
    return (
      <main id="main-content" className="page">
        <EmptyState
          icon="lock"
          title="الاختبار المحاكي ضمن الباقة"
          description="بعد الاشتراك في هذا الاختبار تخوض اختبارًا كاملًا بوقت محدد مثل يوم الاختبار، ثم تراجع كل سؤال."
        >
          <Link href="/subscriptions" className="btn">
            عرض الباقات
          </Link>
        </EmptyState>
      </main>
    );
  }

  return (
    <main id="main-content" className="page page--focused stack stack--loose">
      <PageHeading
        title="الاختبار المحاكي"
        description="تدرّب على يوم الاختبار نفسه: أسئلة من كل المهارات ووقت واحد للاختبار كله."
      />
      <section className="card stack" aria-labelledby="rules-heading">
        <h2 id="rules-heading">قبل أن تبدأ</h2>
        <ul className="rules-list">
          <li>
            <Icon name="clock" /> يبدأ العدّاد عند أول سؤال ولا يتوقف، حتى لو أغلقت الصفحة.
          </li>
          <li>
            <Icon name="eye" /> لا تظهر صحة إجابتك أثناء الحل؛ تراجع كل سؤال وشرحه بعد التسليم.
          </li>
          <li>
            <Icon name="arrow" /> بعد تأكيد الإجابة تنتقل للسؤال التالي، ويمكنك تخطي ما لا تعرفه.
          </li>
          <li>
            <Icon name="flag" /> عند انتهاء الوقت يُسلَّم الاختبار تلقائيًا بما أجبت عنه.
          </li>
        </ul>
        <p className="small muted">
          اختر وقتًا هادئًا ومكانًا بلا مقاطعات، وجهّز ورقة وقلمًا كما في الاختبار الحقيقي.
        </p>
      </section>
      {start.isError ? <ErrorNotice error={start.error} /> : null}
      <div className="row">
        <button
          type="button"
          className="btn"
          disabled={user === null || start.isPending}
          onClick={() => start.mutate()}
        >
          {start.isPending ? "جارٍ تجهيز الاختبار…" : "ابدأ الاختبار الآن"}
        </button>
        <Link href={`/exams/${examId}/profile`} className="btn btn--ghost">
          ليس الآن
        </Link>
      </div>
    </main>
  );
}
