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
  { href: "/dashboard", title: "الرئيسية", icon: "home" },
  { href: "/exams", title: "الاختبارات", icon: "book" },
  { href: "/subscriptions", title: "الباقات", icon: "credit" },
  { href: "/account", title: "حسابي", icon: "user" },
];

const SESSION_RUNNER_PATH = /^\/assessments\/[^/]+\/?$/;

function initialOf(name: string | null | undefined): string | null {
  return name?.trim().charAt(0) || null;
}

/**
 * The student workspace frame. On desktop the sidebar carries navigation and
 * the account, so pages start with their own heading instead of a greeting
 * bar. On phones a slim top bar holds the logo and a bottom bar holds the tabs.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { data: me } = useMe();
  const user = me?.user;
  if (!isWorkspacePath(path)) return children;
  // While a question session runs, the phone shows the question only: one stray
  // tap on the tab bar should not pull a student out mid-exam.
  const inSession = SESSION_RUNNER_PATH.test(path);
  const displayName = user?.displayName?.trim() || null;
  const initial = initialOf(displayName);
  return (
    <div className={`workspace${inSession ? " workspace--focus" : ""}`}>
      <aside className="sidebar" aria-label="القائمة الرئيسية">
        <Brand href="/dashboard" tone="light" tagline={false} />
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
        <div className="sidebar-account">
          <Link href="/account" className="sidebar-account__who">
            <span className="user-avatar" aria-hidden="true">
              {initial ?? <Icon name="user" />}
            </span>
            <span className="sidebar-account__name">
              <strong>{displayName ?? "حسابي"}</strong>
              <small>
                <bdi>{user?.email ?? user?.phone ?? "إعدادات الحساب"}</bdi>
              </small>
            </span>
          </Link>
          <SignOutButton />
        </div>
      </aside>
      <div className="workspace-body">
        <header className="workspace-header">
          <Brand href="/dashboard" tagline={false} />
          <Link href="/account" className="user-avatar" aria-label="حسابي">
            {initial ?? <Icon name="user" />}
          </Link>
        </header>
        <div className="workspace-content">{children}</div>
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
