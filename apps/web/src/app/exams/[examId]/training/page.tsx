"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

import { EmptyState } from "@/components/empty-state";
import { ErrorNotice, Loading } from "@/components/status";
import { isApiError, startTraining } from "@/lib/api";
import { useRequireUser } from "@/lib/session";

/**
 * Create or locate adaptive training (PRD §6). Which skill to train, and with
 * which question, is the API's decision; the session page plays it.
 */
export default function TrainingPage() {
  const { examId } = useParams<{ examId: string }>();
  const router = useRouter();
  const user = useRequireUser();
  const session = useQuery({
    queryKey: ["training-session", user?.id, examId],
    queryFn: () => startTraining(examId),
    enabled: user !== null,
    retry: false,
    staleTime: 0,
  });

  useEffect(() => {
    if (session.data) router.replace(`/assessments/${session.data.id}`);
  }, [session.data, router]);

  if (isApiError(session.error, "TRAINING_REQUIRES_ACCESS")) {
    return (
      <main id="main-content" className="page">
        <EmptyState
          icon="lock"
          title="التدريب التكيفي ضمن الباقة"
          description="بعد الاشتراك في هذا الاختبار تتدرّب على فجواتك، سؤالًا بعد سؤال بمستوى يناسبك."
        >
          <Link href="/subscriptions" className="btn">
            عرض الباقات
          </Link>
        </EmptyState>
      </main>
    );
  }
  if (isApiError(session.error, "NOTHING_TO_TRAIN")) {
    return (
      <main id="main-content" className="page">
        <EmptyState
          icon="check"
          title="لا يوجد ما تتدرّب عليه الآن"
          description="مهاراتك في هذا الاختبار جاهزة لإعادة القياس أو متقنة، أو لا توجد أسئلة جديدة لها بعد."
        >
          <Link href={`/exams/${examId}/profile`} className="btn">
            ملف مهاراتي
          </Link>
        </EmptyState>
      </main>
    );
  }
  return (
    <main id="main-content" className="page page--focused stack stack--loose">
      <h1>التدريب التكيفي</h1>
      {session.isError ? (
        <ErrorNotice error={session.error}>
          <Link href={`/exams/${examId}/profile`} className="btn btn--small">
            ملف مهاراتي
          </Link>
        </ErrorNotice>
      ) : (
        <Loading label="جارٍ تجهيز التدريب…" />
      )}
    </main>
  );
}
