"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

import { EmptyState } from "@/components/empty-state";
import { ErrorNotice, Loading } from "@/components/status";
import { isApiError, startFullDiagnostic } from "@/lib/api";
import { useRequireUser } from "@/lib/session";

/**
 * Create or locate the paid full diagnostic (PRD §6). The session page then
 * resumes its exact items; the API decides access and what is left to ask.
 */
export default function FullDiagnosticPage() {
  const { examId } = useParams<{ examId: string }>();
  const router = useRouter();
  const user = useRequireUser();
  const session = useQuery({
    queryKey: ["full-diagnostic-session", user?.id, examId],
    queryFn: () => startFullDiagnostic(examId),
    enabled: user !== null,
    retry: false,
    staleTime: 0,
  });

  useEffect(() => {
    if (session.data) router.replace(`/assessments/${session.data.id}`);
  }, [session.data, router]);

  if (isApiError(session.error, "FULL_DIAGNOSTIC_REQUIRES_ACCESS")) {
    return (
      <main id="main-content" className="page">
        <EmptyState
          icon="lock"
          title="التشخيص الكامل ضمن الباقة"
          description="بعد الاشتراك في هذا الاختبار تكمل التشخيص من حيث توقفت، وتُحسب إجاباتك السابقة."
        >
          <Link href="/subscriptions" className="btn">
            عرض الباقات
          </Link>
        </EmptyState>
      </main>
    );
  }
  if (isApiError(session.error, "FULL_DIAGNOSTIC_ALREADY_COMPLETED")) {
    return (
      <main id="main-content" className="page">
        <EmptyState
          icon="check"
          title="أكملت التشخيص الكامل"
          description="ملف مهاراتك يعرض مستواك في كل مهارة، والفجوات مرتبة حسب أولويتها."
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
      <h1>التشخيص الكامل</h1>
      {session.isError ? (
        <ErrorNotice error={session.error}>
          <Link href={`/exams/${examId}/profile`} className="btn btn--small">
            ملف مهاراتي
          </Link>
        </ErrorNotice>
      ) : (
        <Loading label="جارٍ تجهيز التشخيص الكامل…" />
      )}
    </main>
  );
}
