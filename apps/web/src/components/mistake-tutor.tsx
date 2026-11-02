"use client";

import { useMutation, useQuery } from "@tanstack/react-query";

import { Icon } from "@/components/icon";
import { ErrorNotice } from "@/components/status";
import { ERROR_TYPE_LABELS, explainMistake, getAiFeatures } from "@/lib/tutor-api";

/**
 * "Explain my mistake": a personalised explanation of the student's own
 * wrong answer, with the likely kind of error. Renders nothing when the
 * deployment has not turned the feature on.
 */
export function MistakeTutor({
  examId,
  questionVersionId,
}: {
  examId: string;
  questionVersionId: string;
}) {
  const features = useQuery({
    queryKey: ["ai-features"],
    queryFn: getAiFeatures,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  const explain = useMutation({
    mutationFn: () => explainMistake(examId, questionVersionId),
  });

  if (!features.data?.mistakeExplanations) return null;

  const result = explain.data?.explanation;
  if (result) {
    const label = ERROR_TYPE_LABELS[result.errorType];
    return (
      <section className="tutor stack" aria-label="شرح مخصص لخطئك" aria-live="polite">
        <p className="tutor__title">
          <Icon name="spark" /> لماذا أخطأت؟
          {label ? <span className="badge">{label}</span> : null}
        </p>
        <p>{result.explanation}</p>
        <p className="tutor__tip">
          <strong>نصيحة:</strong> {result.tip}
        </p>
        <p className="small muted">شرح مولّد بالذكاء الاصطناعي ومبني على الإجابة المعتمدة.</p>
      </section>
    );
  }

  return (
    <div className="stack">
      <button
        type="button"
        className="btn btn--ghost btn--small tutor__trigger"
        disabled={explain.isPending}
        onClick={() => explain.mutate()}
      >
        <Icon name="spark" />
        {explain.isPending ? "جارٍ تحليل إجابتك…" : "اشرح لي لماذا أخطأت"}
      </button>
      {explain.isError ? <ErrorNotice error={explain.error} /> : null}
    </div>
  );
}
