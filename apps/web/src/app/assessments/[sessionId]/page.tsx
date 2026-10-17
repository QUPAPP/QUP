"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

import { AssessmentQuestions } from "@/components/assessment-questions";
import { ErrorNotice, Loading } from "@/components/status";
import { getSession, startSession } from "@/lib/api";
import { useRequireUser } from "@/lib/session";

export default function AssessmentPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const router = useRouter();
  const user = useRequireUser();
  const session = useQuery({
    queryKey: ["resume-session", user?.id, sessionId],
    queryFn: async () => {
      const stored = await getSession(sessionId);
      return stored.status === "CREATED" && stored.type === "MINI_DIAGNOSTIC"
        ? startSession(sessionId)
        : stored;
    },
    enabled: user !== null,
    staleTime: 0,
  });

  useEffect(() => {
    if (session.data?.status === "COMPLETED" && session.data.type === "MINI_DIAGNOSTIC") {
      router.replace(`/assessments/${sessionId}/result`);
    }
  }, [session.data, router, sessionId]);

  const redirecting =
    session.data?.status === "COMPLETED" && session.data.type === "MINI_DIAGNOSTIC";
  return (
    <main id="main-content" className="page page--focused stack stack--loose">
      <h1>التشخيص المصغّر</h1>
      <p className="muted small">
        خذ وقتك في القراءة. كل إجابة تؤكدها تُحفظ، ويمكنك العودة لإكمال جلستك لاحقًا.
      </p>
      {session.isPending || redirecting ? <Loading label="جارٍ استعادة جلستك…" /> : null}
      {session.isError ? <ErrorNotice error={session.error} /> : null}
      {session.data?.status === "IN_PROGRESS" && session.data.type === "MINI_DIAGNOSTIC" ? (
        <AssessmentQuestions key={sessionId} sessionId={sessionId} />
      ) : session.data && !redirecting ? (
        <p className="notice">هذه الجلسة غير متاحة للاستكمال.</p>
      ) : null}
      <p>
        <Link href="/dashboard">العودة إلى جلساتي</Link>
      </p>
    </main>
  );
}
