"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

import { EmptyState } from "@/components/empty-state";
import { ErrorNotice, Loading } from "@/components/status";
import { isApiError, startReassessment } from "@/lib/api";
import { answersText } from "@/lib/mastery-labels";
import { useRequireUser } from "@/lib/session";

/**
 * Create or locate a skill reassessment (ADAPTIVE_ENGINE.md §13). Whether the
 * skill is ready is the API's decision; this page only explains the answer.
 */
export default function ReassessmentStartPage() {
  const { examId, skillId } = useParams<{ examId: string; skillId: string }>();
  const router = useRouter();
  const user = useRequireUser();
  const session = useQuery({
    queryKey: ["reassessment-session", user?.id, examId, skillId],
    queryFn: () => startReassessment(examId, skillId),
    enabled: user !== null,
    retry: false,
    staleTime: 0,
  });
  const openElsewhere = isApiError(session.error, "REASSESSMENT_IN_PROGRESS")
    ? (session.error.details as { sessionId?: string } | undefined)?.sessionId
    : undefined;

  useEffect(() => {
    if (session.data) router.replace(`/assessments/${session.data.id}`);
    else if (openElsewhere) router.replace(`/assessments/${openElsewhere}`);
  }, [session.data, openElsewhere, router]);

  const profileLink = (
    <Link href={`/exams/${examId}/profile`} className="btn">
      ملف مهاراتي
    </Link>
  );
  if (isApiError(session.error, "REASSESSMENT_REQUIRES_ACCESS")) {
    return (
      <main id="main-content" className="page">
        <EmptyState
          icon="lock"
          title="إعادة القياس ضمن الباقة"
          description="بعد الاشتراك تتدرّب على مهاراتك ثم تعيد قياسها لتثبت إتقانها."
        >
          <Link href="/subscriptions" className="btn">
            عرض الباقات
          </Link>
        </EmptyState>
      </main>
    );
  }
  if (isApiError(session.error, "SKILL_NOT_READY_FOR_REASSESSMENT")) {
    const remaining = (session.error.details as { remainingAttempts?: number | null } | undefined)
      ?.remainingAttempts;
    return (
      <main id="main-content" className="page">
        <EmptyState
          icon="compass"
          title="المهارة ليست جاهزة لإعادة القياس بعد"
          description={
            remaining
              ? `تدرّب عليها أولًا: باقي ${answersText(remaining)} قبل أن تعيد المحاولة.`
              : "تصبح جاهزة حين يصل مستواك فيها إلى حد الإتقان بثقة كافية وتغطية كاملة."
          }
        >
          <Link href={`/exams/${examId}/training`} className="btn">
            التدريب
          </Link>
        </EmptyState>
      </main>
    );
  }
  return (
    <main id="main-content" className="page page--focused stack stack--loose">
      <h1>إعادة قياس المهارة</h1>
      {session.isError && !openElsewhere ? (
        <ErrorNotice error={session.error}>{profileLink}</ErrorNotice>
      ) : (
        <Loading label="جارٍ تجهيز إعادة القياس…" />
      )}
    </main>
  );
}
