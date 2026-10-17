"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { RichContent } from "@/components/rich-content";
import { ErrorNotice, Loading } from "@/components/status";
import {
  type CurrentItem,
  getCurrentItem,
  type SubmitResult,
  skipItem,
  submitAnswer,
} from "@/lib/api";

const PERCENT = 100;

export function AssessmentQuestions({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const queryKey = ["current-item", sessionId];
  const current = useQuery({ queryKey, queryFn: () => getCurrentItem(sessionId) });

  const item = current.data?.item ?? null;
  useEffect(() => {
    // Nothing left to answer: the diagnostic is complete.
    if (current.data && current.data.item === null) {
      router.replace(`/assessments/${sessionId}/result`);
    }
  }, [current.data, router, sessionId]);

  if (current.isPending) return <Loading />;
  if (current.isError) return <ErrorNotice error={current.error} />;
  if (!item) return <Loading label="جارٍ حساب نتيجتك…" />;

  return (
    <Question
      // A new question starts from a clean slate: no selection, no feedback.
      key={item.id}
      sessionId={sessionId}
      item={item}
      progress={current.data.progress}
      onNext={(completed) =>
        completed
          ? router.replace(`/assessments/${sessionId}/result`)
          : queryClient.invalidateQueries({ queryKey })
      }
    />
  );
}

interface QuestionProps {
  sessionId: string;
  item: NonNullable<CurrentItem["item"]>;
  progress: CurrentItem["progress"];
  onNext: (completed: boolean) => void;
}

function Question({ sessionId, item, progress, onNext }: QuestionProps) {
  const queryClient = useQueryClient();
  const multiple = item.question.questionType === "MULTIPLE_CHOICE";
  const [selected, setSelected] = useState<string[]>([]);
  // One key per question: a retry after a dropped connection is recognised by
  // the server as the same submission, never recorded twice.
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  const submit = useMutation<SubmitResult, unknown, "ANSWER" | "SKIP">({
    mutationFn: (kind) =>
      kind === "ANSWER"
        ? submitAnswer(sessionId, item.id, selected, idempotencyKey, multiple)
        : skipItem(sessionId, item.id, idempotencyKey),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["assessment-history"] }),
  });
  const outcome = submit.data;
  const locked = submit.isPending || outcome !== undefined;

  const toggle = (key: string) =>
    setSelected((keys) =>
      multiple ? (keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]) : [key],
    );

  const position = progress.answered + 1;
  return (
    <section className="card question-card stack stack--loose" aria-labelledby="question-heading">
      <div className="stack">
        <div className="question-meta">
          <p className="small muted" id="question-heading">
            السؤال <strong>{position}</strong> من {progress.total}
          </p>
          <span>خطوة نحو فهم مستواك</span>
        </div>
        <div
          className="progress"
          role="progressbar"
          aria-label="التقدم في التشخيص"
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.answered}
        >
          <div
            className="progress__bar"
            style={{ width: `${(progress.answered / progress.total) * PERCENT}%` }}
          />
        </div>
      </div>

      <fieldset className="options" disabled={locked}>
        <legend>
          <RichContent content={item.question.stem} />
        </legend>
        {multiple ? <p className="small muted">يمكن اختيار أكثر من إجابة.</p> : null}
        {item.question.options.map((option) => (
          <label key={option.key} className="option">
            <input
              type={multiple ? "checkbox" : "radio"}
              name="answer"
              value={option.key}
              checked={selected.includes(option.key)}
              onChange={() => toggle(option.key)}
            />
            <span>
              <RichContent content={option.content} />
            </span>
            <span className="option-key" dir="ltr">
              {option.key}
            </span>
          </label>
        ))}
      </fieldset>

      {submit.isError ? <ErrorNotice error={submit.error} /> : null}
      {outcome ? <Feedback isCorrect={outcome.result.isCorrect} /> : null}

      <div className="question-footer">
        {outcome ? (
          <button
            type="button"
            className="btn"
            onClick={() => onNext(outcome.next.type === "COMPLETED")}
          >
            {outcome.next.type === "COMPLETED" ? "عرض النتيجة" : "السؤال التالي"}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn"
              disabled={selected.length === 0 || submit.isPending}
              onClick={() => submit.mutate("ANSWER")}
            >
              {submit.isPending ? "جارٍ الإرسال…" : "تأكيد الإجابة"}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={submit.isPending}
              onClick={() => submit.mutate("SKIP")}
            >
              تخطي
            </button>
          </>
        )}
      </div>
    </section>
  );
}

/** Right or wrong only — the correct answer and its explanation are not shown here. */
function Feedback({ isCorrect }: { isCorrect: boolean | null }) {
  if (isCorrect === null) {
    return (
      <p className="notice" role="status">
        تم تخطي السؤال.
      </p>
    );
  }
  return (
    <p className={`notice ${isCorrect ? "notice--success" : "notice--error"}`} role="status">
      {isCorrect ? "إجابة صحيحة" : "إجابة غير صحيحة"}
    </p>
  );
}
