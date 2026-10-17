"use client";
import Link from "next/link";
import { Icon } from "@/components/icon";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="main-content" className="error-page">
      <div>
        <span className="empty-state-symbol">
          <Icon name="compass" />
        </span>
        <h1>تعذّر تحميل هذه الخطوة.</h1>
        <p className="muted">
          حاول مرة أخرى، أو ارجع إلى جلساتك. لن تحتاج لإعادة إرسال إجابات سبق تأكيدها.
        </p>
        <div className="row">
          <button type="button" className="btn" onClick={reset}>
            إعادة المحاولة
          </button>
          <Link href="/dashboard" className="btn btn--ghost">
            العودة إلى جلساتي
          </Link>
        </div>
      </div>
    </main>
  );
}
