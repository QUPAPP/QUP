import Link from "next/link";
import { Icon } from "@/components/icon";

export default function NotFound() {
  return (
    <main id="main-content" className="error-page">
      <div>
        <span className="error-page-code" aria-hidden="true">
          404
        </span>
        <h1>يبدو أن الطريق تغيّر.</h1>
        <p className="muted">هذه الصفحة غير موجودة. ارجع للرئيسية أو افتح جلساتك لتكمل رحلتك.</p>
        <div className="row">
          <Link href="/" className="btn">
            الصفحة الرئيسية <Icon name="arrow" />
          </Link>
          <Link href="/dashboard" className="btn btn--ghost">
            جلساتي
          </Link>
        </div>
      </div>
    </main>
  );
}
