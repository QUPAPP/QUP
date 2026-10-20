"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useId } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { isApiError } from "@/lib/api";
import { type ReviewDecision, reviewVersion } from "@/lib/question-api";
import { ErrorNotice } from "../status";
import { useSingleFlight } from "./use-single-flight";

const NOTES_MAX = 2_000;

const DECISIONS: { value: ReviewDecision; label: string }[] = [
  { value: "APPROVED", label: "اعتماد" },
  { value: "CHANGES_REQUESTED", label: "طلب تعديلات (تعود مسودة)" },
  { value: "REJECTED", label: "رفض (تعود مسودة)" },
];

// Mirrors the API's rule only to spare a round trip: a version sent back must say why.
const reviewSchema = z
  .object({
    decision: z.enum(["APPROVED", "CHANGES_REQUESTED", "REJECTED"]),
    notes: z.string().trim().max(NOTES_MAX, `${NOTES_MAX} حرف كحد أقصى`),
  })
  .refine((review) => review.decision === "APPROVED" || review.notes !== "", {
    message: "اكتب للمؤلف ما يحتاج تعديله",
    path: ["notes"],
  });
type ReviewForm = z.infer<typeof reviewSchema>;

export function ReviewPanel({
  versionId,
  onDone,
  onStale,
}: {
  versionId: string;
  onDone: () => void;
  onStale: () => void;
}) {
  const id = useId();
  const form = useForm<ReviewForm>({
    resolver: zodResolver(reviewSchema),
    defaultValues: { decision: "APPROVED", notes: "" },
  });
  const send = useSingleFlight(({ decision, notes }: ReviewForm) =>
    reviewVersion(versionId, notes ? { decision, notes } : { decision }),
  );
  const review = useMutation({
    mutationFn: send,
    onSuccess: onDone,
    onError: (error) => {
      if (isApiError(error, "QUESTION_VERSION_CHANGED")) onStale();
      if (isApiError(error, "INVALID_QUESTION_TRANSITION")) onStale();
    },
  });
  const notesError = form.formState.errors.notes?.message;

  return (
    <form
      className="stack"
      noValidate
      onSubmit={form.handleSubmit((values) => review.mutate(values))}
    >
      {review.isError ? <ErrorNotice error={review.error} /> : null}
      <fieldset className="stack review-decisions">
        <legend className="field__label">القرار</legend>
        {DECISIONS.map((decision) => (
          <label key={decision.value} className="checkbox">
            <input type="radio" value={decision.value} {...form.register("decision")} />
            {decision.label}
          </label>
        ))}
      </fieldset>
      <div className="field">
        <label className="field__label" htmlFor={`${id}-notes`}>
          ملاحظات للمؤلف
        </label>
        <textarea
          id={`${id}-notes`}
          className="field__input"
          rows={3}
          aria-invalid={notesError ? true : undefined}
          aria-describedby={notesError ? `${id}-notes-error` : `${id}-notes-hint`}
          {...form.register("notes")}
        />
        <span id={`${id}-notes-hint`} className="field__hint">
          مطلوبة عند طلب التعديل أو الرفض.
        </span>
        {notesError ? (
          <span id={`${id}-notes-error`} className="field__error" role="alert">
            {notesError}
          </span>
        ) : null}
      </div>
      <button type="submit" className="btn" disabled={review.isPending}>
        {review.isPending ? "جارٍ الإرسال…" : "إرسال المراجعة"}
      </button>
    </form>
  );
}
