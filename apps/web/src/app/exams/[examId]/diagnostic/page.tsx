"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { RichContent } from "@/components/rich-content";
import { ErrorNotice, Loading } from "@/components/status";
import {
  type CurrentItem,
  getCurrentItem,
  isApiError,
  type SubmitResult,
  skipItem,
  startMiniDiagnostic,
  startSession,
  submitAnswer,
} from "@/lib/api";
import { useRequireUser } from "@/lib/session";

const PERCENT = 100;

/** The session to work in: the open one, or a new one, started if need be. */
async function openSession(examId: string): Promise<string> {
  const session = await startMiniDiagnostic(examId);
  if (session.status === "CREATED") await startSession(session.id);
  return session.id;
}

export default function DiagnosticPage() {
  const { examId } = useParams<{ examId: string }>();
  const router = useRouter();
  const user = useRequireUser();

  // Starting is "start or resume" on the server, so asking twice is safe.
  const session = useQuery({
    queryKey: ["diagnostic-session", examId],
    queryFn: () => openSession(examId),
    enabled: user !== null,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

  // Already done: the server tells us which session, and its result is the place to be.
  const finishedSessionId = isApiError(session.error, "MINI_DIAGNOSTIC_ALREADY_COMPLETED")
    ? (session.error.details as { sessionId?: string } | undefined)?.sessionId
    : undefined;
  useEffect(() => {
    if (finishedSessionId) router.replace(`/assessments/${finishedSessionId}/result`);
  }, [finishedSessionId, router]);

  return (
    <main className="page stack stack--loose">
      <h1>التشخيص المصغّر</h1>
      {session.isPending || finishedSessionId ? <Loading label="جارٍ تجهيز التشخيص…" /> : null}
      {session.isError && !finishedSessionId ? <ErrorNotice error={session.error} /> : null}
      {session.data ? <Questions sessionId={session.data} /> : null}
    </main>
  );
}

function Questions({ sessionId }: { sessionId: string }) {
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
  });
  const outcome = submit.data;
  const locked = submit.isPending || outcome !== undefined;

  const toggle = (key: string) =>
    setSelected((keys) =>
      multiple ? (keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]) : [key],
    );

  const position = progress.answered + 1;
  return (
    <section className="card stack stack--loose" aria-labelledby="question-heading">
      <div className="stack">
        <p className="small muted" id="question-heading">
          السؤال {position} من {progress.total}
        </p>
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
        <legend className="mb-4 font-semibold">
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
          </label>
        ))}
      </fieldset>

      {submit.isError ? <ErrorNotice error={submit.error} /> : null}
      {outcome ? <Feedback isCorrect={outcome.result.isCorrect} /> : null}

      <div className="row">
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
