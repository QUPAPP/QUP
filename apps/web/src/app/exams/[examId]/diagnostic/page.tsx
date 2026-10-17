"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

import { ErrorNotice, Loading } from "@/components/status";
import { isApiError, startMiniDiagnostic } from "@/lib/api";
import { useRequireUser } from "@/lib/session";

/** Create or locate the diagnostic; the session page always resumes its exact items. */
export default function DiagnosticPage() {
  const { examId } = useParams<{ examId: string }>();
  const router = useRouter();
  const user = useRequireUser();
  const session = useQuery({
    queryKey: ["diagnostic-session", user?.id, examId],
    queryFn: () => startMiniDiagnostic(examId),
    enabled: user !== null,
    retry: false,
    staleTime: 0,
  });
  const finishedSessionId = isApiError(session.error, "MINI_DIAGNOSTIC_ALREADY_COMPLETED")
    ? (session.error.details as { sessionId?: string } | undefined)?.sessionId
    : undefined;

  useEffect(() => {
    if (finishedSessionId) router.replace(`/assessments/${finishedSessionId}/result`);
    else if (session.data) router.replace(`/assessments/${session.data.id}`);
  }, [finishedSessionId, session.data, router]);

  return (
    <main id="main-content" className="page page--focused stack stack--loose">
      <h1>التشخيص المصغّر</h1>
      {session.isError && !finishedSessionId ? (
        <ErrorNotice error={session.error} />
      ) : (
        <Loading label="جارٍ تجهيز التشخيص…" />
      )}
    </main>
  );
}
