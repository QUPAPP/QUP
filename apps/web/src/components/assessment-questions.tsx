"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { MistakeTutor } from "@/components/mistake-tutor";
import { ReportQuestion } from "@/components/report-question";
import { RichContent } from "@/components/rich-content";
import { ErrorNotice, Loading } from "@/components/status";
import {
  type AnswerReview,
  type CurrentItem,
  completeSession,
  getCurrentItem,
  isApiError,
  type SubmitResult,
  skipItem,
  submitAnswer,
} from "@/lib/api";
import {
  correctOptions,
  formatCountdown,
  optionIndexForKey,
  optionLetter,
} from "@/lib/diagnostics";

const PERCENT = 100;
const TICK_MS = 1000;
/** The clock turns red for the last five minutes. */
const LOW_TIME_MS = 5 * 60 * 1000;

export function AssessmentQuestions({
  sessionId,
  examId,
  completion,
  endLabel,
  deadline,
}: {
  sessionId: string;
  /** The session's exam: training reviews offer an explanation of a wrong answer. */
  examId?: string;
  /** Where the student goes once every item is finalized, and the button that says so. */
  completion: { href: string; label: string };
  /** Training: the student may stop at any time with a button saying this. */
  endLabel?: string;
  /**
   * Mock exam: the session's clock. Answers move straight on with no
   * feedback, and the exam is handed in when the clock runs out.
   */
  deadline?: string;
}) {
  const examMode = deadline !== undefined;
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
      {deadline ? (
        <ExamClock
          deadline={deadline}
          onTimeUp={() => queryClient.invalidateQueries({ queryKey })}
        />
      ) : null}
      <Question
        // A new question starts from a clean slate: no selection, no feedback.
        key={item.id}
        sessionId={sessionId}
        examId={examId}
        item={item}
        progress={current.data.progress}
        completedLabel={completion.label}
        focusOnMount={item.id !== firstItemId.current}
        examMode={examMode}
        onNext={(completed) =>
          completed ? router.replace(completedHref) : queryClient.invalidateQueries({ queryKey })
        }
        onTimeUp={() => router.replace(completedHref)}
      />
      {endLabel ? (
        <EndSession
          sessionId={sessionId}
          label={endLabel}
          href={completedHref}
          confirmation={
            examMode
              ? `بقي ${current.data.progress.total - current.data.progress.answered} سؤالًا دون إجابة، ولن تُحتسب. هل تريد التسليم الآن؟`
              : undefined
          }
        />
      ) : null}
    </>
  );
}

/**
 * The mock exam's countdown. The server owns the deadline; at zero the page
 * asks again, the server closes the session, and the runner leaves for the result.
 */
function ExamClock({ deadline, onTimeUp }: { deadline: string; onTimeUp: () => void }) {
  const end = useMemo(() => new Date(deadline).getTime(), [deadline]);
  const [now, setNow] = useState(() => Date.now());
  const remaining = end - now;
  const expired = remaining <= 0;
  const onTimeUpRef = useRef(onTimeUp);
  onTimeUpRef.current = onTimeUp;

  useEffect(() => {
    if (expired) {
      onTimeUpRef.current();
      return;
    }
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, [expired]);

  return (
    // A timer is not a live region: read on request, never announced every second.
    <div
      role="timer"
      aria-label="الوقت المتبقي"
      className={`exam-clock${remaining < LOW_TIME_MS ? " exam-clock--low" : ""}`}
    >
      <span className="small" aria-hidden="true">
        الوقت المتبقي
      </span>
      <strong dir="ltr">{formatCountdown(remaining)}</strong>
    </div>
  );
}

/** Training: stop now. Answers already given keep their evidence; an unanswered one gives none. */
function EndSession({
  sessionId,
  label,
  href,
  confirmation,
}: {
  sessionId: string;
  label: string;
  href: string;
  /** Asked before ending, when ending early loses something. */
  confirmation?: string;
}) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const end = useMutation({
    mutationFn: () => completeSession(sessionId),
    onSuccess: () => router.replace(href),
  });
  if (asking) {
    return (
      <div className="question-end question-end--confirm" role="alertdialog" aria-label={label}>
        <p className="small">{confirmation}</p>
        {end.isError ? <ErrorNotice error={end.error} /> : null}
        <div className="row">
          <button
            type="button"
            className="btn btn--small"
            disabled={end.isPending}
            onClick={() => end.mutate()}
          >
            {end.isPending ? "جارٍ التسليم…" : "نعم، سلّم الآن"}
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            disabled={end.isPending}
            onClick={() => setAsking(false)}
          >
            متابعة الحل
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="question-end">
      {end.isError ? <ErrorNotice error={end.error} /> : null}
      <button
        type="button"
        className="btn btn--ghost btn--small"
        disabled={end.isPending}
        onClick={() => (confirmation ? setAsking(true) : end.mutate())}
      >
        {end.isPending ? "جارٍ الإنهاء…" : label}
      </button>
    </div>
  );
}

interface QuestionProps {
  sessionId: string;
  examId?: string;
  item: NonNullable<CurrentItem["item"]>;
  progress: CurrentItem["progress"];
  completedLabel: string;
  /** Moves keyboard and screen-reader focus to this question when it appears. */
  focusOnMount: boolean;
  /** Mock exam: no feedback, the next question follows the answer at once. */
  examMode: boolean;
  onNext: (completed: boolean) => void;
  onTimeUp: () => void;
}

function Question({
  sessionId,
  examId,
  item,
  progress,
  completedLabel,
  focusOnMount,
  examMode,
  onNext,
  onTimeUp,
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
    onSuccess: (result, kind) => {
      void queryClient.invalidateQueries({ queryKey: ["assessment-history"] });
      if (kind === "SKIP" || examMode) onNext(result.next.type === "COMPLETED");
    },
    onError: (error) => {
      if (isApiError(error, "MOCK_EXAM_TIME_UP")) onTimeUp();
    },
  });
  // In exam mode the answer is never judged on screen; the runner moves on instead.
  const outcome = examMode ? undefined : submit.data;
  const locked = submit.isPending || submit.data !== undefined;

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

  const options = item.question.options;
  const canSubmit = selected.length > 0 && !locked;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("textarea, select, input:not([type=radio]):not([type=checkbox])")) return;
      if (event.key === "Enter") {
        if (target?.closest("button, a")) return;
        if (outcome) {
          event.preventDefault();
          nextRef.current?.click();
        } else if (canSubmit) {
          event.preventDefault();
          submit.mutate("ANSWER");
        }
        return;
      }
      if (locked) return;
      const index = optionIndexForKey(event.key, options.length);
      const option = index === null ? undefined : options[index];
      if (!option) return;
      event.preventDefault();
      toggle(option.key);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const correctKeys = outcome?.review?.correctOptionKeys;
  const optionState = (key: string): string => {
    if (!outcome) return "";
    if (correctKeys?.includes(key)) return " option--correct";
    if (!selected.includes(key)) return "";
    if (outcome.result.isCorrect === true) return " option--correct";
    if (outcome.result.isCorrect === false) return " option--wrong";
    return "";
  };

  const position = progress.answered + 1;
  return (
    <section className="card question-card stack stack--loose" aria-labelledby="question-heading">
      <div className="stack">
        <div className="question-meta">
          <p className="small muted" id="question-heading" ref={headingRef} tabIndex={-1}>
            السؤال <strong>{position}</strong> من {progress.total}
          </p>
          <span>
            {item.target
              ? `تدريب على: ${item.target.skillName}`
              : examMode
                ? "اختبار محاكي"
                : "خطوة نحو فهم مستواك"}
          </span>
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
        {options.map((option, index) => (
          <label key={option.key} className={`option${optionState(option.key)}`}>
            <input
              type={multiple ? "checkbox" : "radio"}
              name="answer"
              value={option.key}
              checked={selected.includes(option.key)}
              onChange={() => toggle(option.key)}
            />
            <span className="option__content">
              <RichContent content={option.content} />
            </span>
            <span className="option-key">{optionLetter(index)}</span>
          </label>
        ))}
      </fieldset>
      {locked ? null : (
        <p className="question-shortcuts small muted">
          اختصار: اضغط <kbd>1</kbd>–<kbd>{options.length}</kbd> أو الحرف للاختيار، ثم{" "}
          <kbd>Enter</kbd> للتأكيد.
        </p>
      )}

      {submit.isError ? <ErrorNotice error={submit.error} /> : null}
      {outcome ? <Feedback isCorrect={outcome.result.isCorrect} /> : null}
      {outcome?.review ? <Review options={item.question.options} review={outcome.review} /> : null}
      {outcome?.review && outcome.result.isCorrect === false && examId ? (
        <MistakeTutor examId={examId} questionVersionId={item.question.questionVersionId} />
      ) : null}

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
              {submit.isPending
                ? "جارٍ الإرسال…"
                : examMode && position === progress.total
                  ? "تأكيد وإنهاء الاختبار"
                  : "تأكيد الإجابة"}
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
      <ReportQuestion sessionId={sessionId} itemId={item.id} />
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
            <span className="option-key">{optionLetter(options.indexOf(option))}</span>
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
