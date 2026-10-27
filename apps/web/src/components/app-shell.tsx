"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { firstName } from "@/lib/dashboard-view";
import { isActivePath, isWorkspacePath } from "@/lib/navigation";
import { hasAdminAccess } from "@/lib/permissions";
import { useMe } from "@/lib/session";
import { Brand } from "./brand";
import { Icon, type IconName } from "./icon";
import { SignOutButton } from "./sign-out-button";

const links: { href: string; title: string; icon: IconName }[] = [
  { href: "/dashboard", title: "الرئيسية", icon: "home" },
  { href: "/exams", title: "الاختبارات", icon: "book" },
  { href: "/subscriptions", title: "الباقات", icon: "credit" },
  { href: "/account", title: "حسابي", icon: "user" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { data: me } = useMe();
  const user = me?.user;
  if (!isWorkspacePath(path)) return children;
  const name = firstName(user?.displayName);
  return (
    <div className="workspace">
      <aside className="sidebar" aria-label="القائمة الرئيسية">
        <Brand href="/dashboard" tone="light" />
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
            </Link>
          ))}
          {hasAdminAccess(me) ? (
            <Link href="/admin" className="sidebar-link sidebar-link--separated">
              <Icon name="lock" />
              <span>لوحة الإدارة</span>
            </Link>
          ) : null}
        </nav>
        <div className="sidebar-card">
          <Image
            src="/brand/qup-mountain-journey-1200.webp"
            alt=""
            fill
            sizes="15rem"
            className="sidebar-card__photo"
          />
          <div className="sidebar-card__body">
            <strong>كل خطوة صغيرة</strong>
            <span>تقرّبك من هدفك الكبير.</span>
            <Link href="/exams">
              اختر اختبارك <Icon name="arrow" />
            </Link>
          </div>
        </div>
        <div className="sidebar-bottom">
          <SignOutButton />
        </div>
      </aside>
      <div className="workspace-body">
        <header className="workspace-header">
          <div className="workspace-greeting">
            <span className="workspace-greeting__brand">
              <Brand href="/dashboard" tagline={false} />
            </span>
            <div>
              <strong>{name ? `مرحبًا، ${name}` : "مرحبًا بك"}</strong>
              <span>رحلتك نحو هدفك تبدأ من هنا.</span>
            </div>
          </div>
          <div className="workspace-user">
            <Link href="/subscriptions" className="btn btn--ghost btn--small workspace-plans">
              <Icon name="credit" />
              الباقات
            </Link>
            <Link href="/account" className="user-chip" aria-label="حسابي">
              <span className="user-avatar" aria-hidden="true">
                {user?.displayName?.trim().charAt(0) || <Icon name="user" />}
              </span>
              <span className="user-chip__name">{user?.displayName ?? "حسابي"}</span>
            </Link>
          </div>
        </header>
        <div className="workspace-content">{children}</div>
        <footer className="workspace-footer">
          <span>كل خطوة تعلّم تصنع فرقًا.</span>
          <span dir="ltr">QUP © {new Date().getFullYear()}</span>
        </footer>
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
            <Link href="/admin">
              <Icon name="lock" />
              الإدارة
            </Link>
          ) : null}
        </nav>
      </div>
    </div>
  );
}
