"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * A button that asks before acting, inline rather than in a modal. The
 * question says what will happen and is read with the confirm button, which
 * takes focus; it stays disabled while the request is in flight, so a double
 * click cannot send it twice.
 */
export function ConfirmAction({
  label,
  description,
  confirmLabel,
  onConfirm,
  pending,
  danger = false,
}: {
  label: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  pending: boolean;
  danger?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const descriptionId = useId();
  const confirm = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) confirm.current?.focus();
  }, [open]);

  // Once the request settles, the question has been answered.
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending) setOpen(false);
    wasPending.current = pending;
  }, [pending]);

  if (!open) {
    return (
      <button
        type="button"
        className={`btn btn--small ${danger ? "btn--danger" : "btn--ghost"}`}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="confirm-panel">
      <p id={descriptionId}>{description}</p>
      <div className="row">
        <button
          ref={confirm}
          type="button"
          className={`btn btn--small ${danger ? "btn--danger" : ""}`}
          aria-describedby={descriptionId}
          disabled={pending}
          onClick={onConfirm}
        >
          {pending ? "جارٍ التنفيذ…" : (confirmLabel ?? label)}
        </button>
        <button
          type="button"
          className="btn btn--small btn--ghost"
          disabled={pending}
          onClick={() => setOpen(false)}
        >
          إلغاء
        </button>
      </div>
    </div>
  );
}
