"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isWorkspacePath } from "@/lib/navigation";
import { Brand } from "./brand";

export function SiteFooter() {
  const path = usePathname();
  if (isWorkspacePath(path) || path === "/login" || path === "/register") return null;
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <Brand />
        <p>تعلّم يبدأ بفهم مستواك.</p>
        <nav aria-label="روابط التذييل">
          <Link href="/register">ابدأ رحلتك</Link>
          <Link href="/login">تسجيل الدخول</Link>
          <a href="/#how-it-works">كيف يعمل؟</a>
        </nav>
      </div>
      <div className="footer-bottom">
        <span>QUP · جميع الحقوق محفوظة</span>
        <span>صُمّم للتعلّم، خطوة بخطوة.</span>
      </div>
    </footer>
  );
}
