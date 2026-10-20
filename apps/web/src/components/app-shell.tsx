"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { isActivePath, isWorkspacePath } from "@/lib/navigation";
import { hasAdminAccess } from "@/lib/permissions";
import { useMe } from "@/lib/session";
import { Brand } from "./brand";
import { Icon, type IconName } from "./icon";
import { SignOutButton } from "./sign-out-button";

const links: { href: string; title: string; icon: IconName }[] = [
  { href: "/dashboard", title: "جلساتي", icon: "grid" },
  { href: "/exams", title: "الاختبارات", icon: "book" },
  { href: "/subscriptions", title: "الباقات", icon: "credit" },
  { href: "/account", title: "حسابي", icon: "user" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { data: me } = useMe();
  const user = me?.user;
  if (!isWorkspacePath(path)) return children;
  const current = links.find((link) => isActivePath(path, link.href));
  return (
    <div className="workspace">
      <aside className="sidebar" aria-label="القائمة الرئيسية">
        <Brand href="/dashboard" />
        <div className="sidebar-section-label">مساحتك التعليمية</div>
        <nav className="sidebar-nav" aria-label="التنقل الرئيسي">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`sidebar-link ${isActivePath(path, link.href) ? "is-active" : ""}`}
              aria-current={isActivePath(path, link.href) ? "page" : undefined}
            >
              <Icon name={link.icon} />
              <span>{link.title}</span>
              <Icon name="chevron" className="nav-chevron" />
            </Link>
          ))}
          {hasAdminAccess(me) ? (
            <Link href="/admin/exams" className="sidebar-link">
              <Icon name="lock" />
              <span>لوحة الإدارة</span>
              <Icon name="chevron" className="nav-chevron" />
            </Link>
          ) : null}
        </nav>
        <div className="sidebar-note">
          <Icon name="compass" />
          <strong>خطوة صغيرة، بداية واضحة.</strong>
          <p>ابدأ بالتشخيص المصغّر، واعرف ما تحتاج إلى التركيز عليه.</p>
          <Link href="/exams">
            اختر اختبارك <Icon name="arrow" />
          </Link>
        </div>
        <div className="sidebar-bottom">
          <SignOutButton />
          <span className="small muted">QUP · تعلّم بخطوات أوضح</span>
        </div>
      </aside>
      <div className="workspace-body">
        <header className="workspace-header">
          <div className="workspace-breadcrumb">
            <span>مساحتي</span>
            <Icon name="chevron" />
            <strong>{current?.title ?? "رحلتي التعليمية"}</strong>
          </div>
          <div className="workspace-user">
            <span className="user-avatar" aria-hidden="true">
              {user?.displayName?.trim().charAt(0) || <Icon name="user" />}
            </span>
            <span>{user?.displayName ?? "حساب الطالب"}</span>
            <span className="session-indicator">مساحة خاصة</span>
          </div>
        </header>
        <nav className="mobile-nav" aria-label="التنقل على الجوال">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActivePath(path, link.href) ? "page" : undefined}
            >
              <Icon name={link.icon} />
              {link.title}
            </Link>
          ))}
          {hasAdminAccess(me) ? (
            <Link href="/admin/exams">
              <Icon name="lock" />
              الإدارة
            </Link>
          ) : null}
        </nav>
        <div className="workspace-content">{children}</div>
        <footer className="workspace-footer">
          <span>كل خطوة تعلّم تصنع فرقًا.</span>
          <span dir="ltr">QUP © {new Date().getFullYear()}</span>
        </footer>
      </div>
    </div>
  );
}
