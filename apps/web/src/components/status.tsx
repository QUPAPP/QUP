import type { ReactNode } from "react";

import { errorMessage } from "@/lib/messages";

export function Loading({ label = "جارٍ التحميل…" }: { label?: string }) {
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <span className="small muted">{label}</span>
      <span className="skeleton" aria-hidden="true" />
      <span className="skeleton" aria-hidden="true" />
      <span className="skeleton" aria-hidden="true" />
    </div>
  );
}

export function ErrorNotice({ error, children }: { error: unknown; children?: ReactNode }) {
  return (
    <div className="notice notice--error" role="alert">
      <p>{errorMessage(error)}</p>
      {children}
    </div>
  );
}
