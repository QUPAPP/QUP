"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isAdminPath, isWorkspacePath } from "@/lib/navigation";
import { Brand } from "./brand";

export function SiteFooter() {
  const path = usePathname();
  if (isWorkspacePath(path) || isAdminPath(path) || path === "/login" || path === "/register")
    return null;
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer__brand">
          <Brand tone="light" />
          <p>منصة تشخيص وتدريب تبدأ من مستواك، وتنتهي بإتقان مُثبت.</p>
        </div>
        <nav aria-label="روابط التذييل">
          <Link href="/register">ابدأ التشخيص المجاني</Link>
          <Link href="/login">تسجيل الدخول</Link>
          <a href="/#how-it-works">كيف يعمل</a>
          <a href="/#questions">أسئلة شائعة</a>
        </nav>
      </div>
      <div className="footer-bottom">
        <span>
          QUP © <bdi>{new Date().getFullYear()}</bdi> · جميع الحقوق محفوظة
        </span>
        <span>صُمّم للتعلّم، خطوة بخطوة.</span>
      </div>
    </footer>
  );
}
