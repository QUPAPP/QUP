"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";

import { ErrorNotice } from "@/components/status";
import { reconcilePayment } from "@/lib/billing-admin-api";

/** Stream payment ids: letters, digits, "-" and "_" (the API checks the same). */
const PROVIDER_ID = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * For a student who paid but has no access (the webhook never arrived): the
 * admin copies the payment's id from Stream's dashboard, and the API asks
 * Stream before it settles anything (RUNBOOK.md §6).
 */
export function ReconcilePayment({ paymentId }: { paymentId: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [providerId, setProviderId] = useState("");
  const client = useQueryClient();
  const reconcile = useMutation({
    mutationFn: () => reconcilePayment(paymentId, providerId.trim()),
    onSuccess: async () => {
      setOpen(false);
      await client.invalidateQueries({ queryKey: ["admin-payments"] });
      await client.invalidateQueries({ queryKey: ["admin-revenue"] });
    },
  });
  const valid = PROVIDER_ID.test(providerId.trim());

  if (!open) {
    return (
      <button type="button" className="btn btn--small btn--ghost" onClick={() => setOpen(true)}>
        دفع الطالب ولم يُفعَّل؟ طابِق مع Stream
      </button>
    );
  }
  return (
    <form
      className="stack"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) reconcile.mutate();
      }}
    >
      {reconcile.isError ? <ErrorNotice error={reconcile.error} /> : null}
      <label className="field" htmlFor={id}>
        <span className="field__label">رقم العملية في لوحة Stream</span>
        <input
          id={id}
          className="field__input"
          dir="ltr"
          autoComplete="off"
          value={providerId}
          onChange={(event) => setProviderId(event.target.value)}
        />
        <span className="field__hint">
          نسأل Stream عنها: تُفعَّل فقط إذا كانت مدفوعة بنفس المبلغ ولم تُستخدم لعملية أخرى.
        </span>
      </label>
      <div className="row">
        <button type="submit" className="btn btn--small" disabled={!valid || reconcile.isPending}>
          {reconcile.isPending ? "جارٍ التحقق…" : "تحقّق وفعّل"}
        </button>
        <button
          type="button"
          className="btn btn--small btn--ghost"
          disabled={reconcile.isPending}
          onClick={() => setOpen(false)}
        >
          إلغاء
        </button>
      </div>
    </form>
  );
}
