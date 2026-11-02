"use client";

import { useMutation } from "@tanstack/react-query";
import { useId, useState } from "react";

import { Icon } from "@/components/icon";
import { ErrorNotice } from "@/components/status";
import { REPORT_REASONS, type ReportReason, reportQuestion } from "@/lib/report-api";

const NOTE_MAX = 1000;

/**
 * "Report a problem" under a question: a small disclosure with a reason and
 * an optional note. The content team reviews every report.
 */
export function ReportQuestion({ sessionId, itemId }: { sessionId: string; itemId: string }) {
  const id = useId();
  const [reason, setReason] = useState<ReportReason>("WRONG_ANSWER");
  const [note, setNote] = useState("");
  const send = useMutation({
    mutationFn: () =>
      reportQuestion(sessionId, itemId, {
        reason,
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
  });

  if (send.isSuccess) {
    return (
      <p className="small muted report-question__done" role="status">
        <Icon name="check" /> شكرًا، وصل بلاغك وسيراجعه فريق المحتوى.
      </p>
    );
  }

  return (
    <details className="report-question">
      <summary className="small">
        <Icon name="flag" /> الإبلاغ عن مشكلة في السؤال
      </summary>
      <form
        className="stack report-question__form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!send.isPending) send.mutate();
        }}
      >
        <fieldset className="field">
          <legend className="field__label">ما المشكلة؟</legend>
          <div className="chip-group">
            {REPORT_REASONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className="chip"
                aria-pressed={reason === option.value}
                onClick={() => setReason(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="field">
          <label className="field__label" htmlFor={`${id}-note`}>
            تفاصيل (اختياري)
          </label>
          <textarea
            id={`${id}-note`}
            className="field__input"
            rows={2}
            maxLength={NOTE_MAX}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
        {send.isError ? <ErrorNotice error={send.error} /> : null}
        <button type="submit" className="btn btn--small btn--ghost" disabled={send.isPending}>
          {send.isPending ? "جارٍ الإرسال…" : "أرسل البلاغ"}
        </button>
      </form>
    </details>
  );
}
