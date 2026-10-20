"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

import { AssessmentQuestions } from "@/components/assessment-questions";
import { ErrorNotice, Loading } from "@/components/status";
import { getSession, startSession } from "@/lib/api";
import {
  COMPLETION_LABELS,
  completionHref,
  DIAGNOSTIC_TITLES,
  isDiagnostic,
} from "@/lib/diagnostics";
import { useRequireUser } from "@/lib/session";

/** Resumes a mini or full diagnostic at its next unanswered item. */
export default function AssessmentPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const router = useRouter();
  const user = useRequireUser();
  const session = useQuery({
    queryKey: ["resume-session", user?.id, sessionId],
    queryFn: async () => {
      const stored = await getSession(sessionId);
      return stored.status === "CREATED" && isDiagnostic(stored.type)
        ? startSession(sessionId)
        : stored;
    },
    enabled: user !== null,
    staleTime: 0,
  });

  const data = session.data;
  const type = data && isDiagnostic(data.type) ? data.type : null;
  const finishedHref =
    data && type && data.status === "COMPLETED"
      ? completionHref({ id: data.id, examId: data.examId, type })
      : null;

  useEffect(() => {
    if (finishedHref) router.replace(finishedHref);
  }, [finishedHref, router]);

  return (
    <main id="main-content" className="page page--focused stack stack--loose">
      <h1>{type ? DIAGNOSTIC_TITLES[type] : "التشخيص"}</h1>
      <p className="muted small">
        خذ وقتك في القراءة. كل إجابة تؤكدها تُحفظ، ويمكنك العودة لإكمال جلستك لاحقًا.
      </p>
      {session.isPending || finishedHref ? <Loading label="جارٍ استعادة جلستك…" /> : null}
      {session.isError ? <ErrorNotice error={session.error} /> : null}
      {data && type && data.status === "IN_PROGRESS" ? (
        <AssessmentQuestions
          key={sessionId}
          sessionId={sessionId}
          completion={{
            href: completionHref({ id: data.id, examId: data.examId, type }),
            label: COMPLETION_LABELS[type],
          }}
        />
      ) : data && !finishedHref ? (
        <p className="notice">هذه الجلسة غير متاحة للاستكمال.</p>
      ) : null}
      <p>
        <Link href="/dashboard">العودة إلى جلساتي</Link>
      </p>
    </main>
  );
}
