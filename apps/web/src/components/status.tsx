import type { ReactNode } from "react";

import { errorMessage } from "@/lib/messages";

export function Loading({ label = "جارٍ التحميل…" }: { label?: string }) {
  return (
    <p className="muted" role="status">
      {label}
    </p>
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
