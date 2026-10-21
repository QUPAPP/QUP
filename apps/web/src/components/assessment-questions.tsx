"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { RichContent } from "@/components/rich-content";
import { ErrorNotice, Loading } from "@/components/status";
import {
  type AnswerReview,
  type CurrentItem,
  completeSession,
  getCurrentItem,
  type SubmitResult,
  skipItem,
  submitAnswer,
} from "@/lib/api";
import { correctOptions } from "@/lib/diagnostics";

const PERCENT = 100;

export function AssessmentQuestions({
  sessionId,
  completion,
  endLabel,
}: {
  sessionId: string;
  /** Where the student goes once every item is finalized, and the button that says so. */
  completion: { href: string; label: string };
  /** Training: the student may stop at any time with a button saying this. */
  endLabel?: string;
}) {
  const completedHref = completion.href;
  const router = useRouter();
  const queryClient = useQueryClient();
  const queryKey = ["current-item", sessionId];
  const current = useQuery({ queryKey, queryFn: () => getCurrentItem(sessionId) });

  const item = current.data?.item ?? null;
  // The question the page opened on keeps the page's own focus; each later one takes it.
  const firstItemId = useRef<string | null>(null);
  if (item && firstItemId.current === null) firstItemId.current = item.id;
  useEffect(() => {
    // Nothing left to answer: the session is complete.
    if (current.data && current.data.item === null) {
      router.replace(completedHref);
    }
  }, [current.data, router, completedHref]);

  if (current.isPending) return <Loading />;
  if (current.isError) return <ErrorNotice error={current.error} />;
  if (!item) return <Loading label="جارٍ حساب نتيجتك…" />;

  return (
    <>
      <Question
        // A new question starts from a clean slate: no selection, no feedback.
        key={item.id}
        sessionId={sessionId}
        item={item}
        progress={current.data.progress}
        completedLabel={completion.label}
        focusOnMount={item.id !== firstItemId.current}
        onNext={(completed) =>
          completed ? router.replace(completedHref) : queryClient.invalidateQueries({ queryKey })
        }
      />
      {endLabel ? <EndSession sessionId={sessionId} label={endLabel} href={completedHref} /> : null}
    </>
  );
}

/** Training: stop now. Answers already given keep their evidence; an unanswered one gives none. */
function EndSession({
  sessionId,
  label,
  href,
}: {
  sessionId: string;
  label: string;
  href: string;
}) {
  const router = useRouter();
  const end = useMutation({
    mutationFn: () => completeSession(sessionId),
    onSuccess: () => router.replace(href),
  });
  return (
    <div className="question-end">
      {end.isError ? <ErrorNotice error={end.error} /> : null}
      <button
        type="button"
        className="btn btn--ghost btn--small"
        disabled={end.isPending}
        onClick={() => end.mutate()}
      >
        {end.isPending ? "جارٍ الإنهاء…" : label}
      </button>
    </div>
  );
}

interface QuestionProps {
  sessionId: string;
  item: NonNullable<CurrentItem["item"]>;
  progress: CurrentItem["progress"];
  completedLabel: string;
  /** Moves keyboard and screen-reader focus to this question when it appears. */
  focusOnMount: boolean;
  onNext: (completed: boolean) => void;
}

function Question({
  sessionId,
  item,
  progress,
  completedLabel,
  focusOnMount,
  onNext,
}: QuestionProps) {
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

  // The button that had focus disappears on both transitions; without these,
  // focus falls back to the page and a keyboard user starts again from the top.
  const headingRef = useRef<HTMLParagraphElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusOnMount) headingRef.current?.focus();
  }, [focusOnMount]);
  useEffect(() => {
    if (outcome) nextRef.current?.focus();
  }, [outcome]);

  const toggle = (key: string) =>
    setSelected((keys) =>
      multiple ? (keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]) : [key],
    );

  const position = progress.answered + 1;
  return (
    <section className="card question-card stack stack--loose" aria-labelledby="question-heading">
      <div className="stack">
        <div className="question-meta">
          <p className="small muted" id="question-heading" ref={headingRef} tabIndex={-1}>
            السؤال <strong>{position}</strong> من {progress.total}
          </p>
          <span>{item.target ? `تدريب على: ${item.target.skillName}` : "خطوة نحو فهم مستواك"}</span>
        </div>
        <div
          className="progress"
          role="progressbar"
          aria-label="التقدم في الجلسة"
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
      {outcome?.review ? <Review options={item.question.options} review={outcome.review} /> : null}

      <div className="question-footer">
        {outcome ? (
          <button
            ref={nextRef}
            type="button"
            className="btn"
            onClick={() => onNext(outcome.next.type === "COMPLETED")}
          >
            {outcome.next.type === "COMPLETED" ? completedLabel : "السؤال التالي"}
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

/**
 * Training only, after the answer is stored (ADAPTIVE_ENGINE.md §20
 * remediation): the correct option and the explanation. Diagnostics never
 * receive a review from the API.
 */
function Review({
  options,
  review,
}: {
  options: NonNullable<CurrentItem["item"]>["question"]["options"];
  review: AnswerReview;
}) {
  const correct = correctOptions(options, review.correctOptionKeys);
  return (
    <section className="review stack" aria-label="مراجعة السؤال">
      <p className="small">
        <strong>{correct.length > 1 ? "الإجابات الصحيحة" : "الإجابة الصحيحة"}</strong>
      </p>
      <ul className="list">
        {correct.map((option) => (
          <li key={option.key} className="list__item list__item--strength">
            <span>
              <RichContent content={option.content} />
            </span>
            <span className="option-key" dir="ltr">
              {option.key}
            </span>
          </li>
        ))}
      </ul>
      {review.explanation ? (
        <div className="stack">
          <p className="small">
            <strong>الشرح</strong>
          </p>
          <RichContent content={review.explanation} />
        </div>
      ) : null}
    </section>
  );
}
