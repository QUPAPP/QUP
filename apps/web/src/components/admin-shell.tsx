"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { isActivePath } from "@/lib/navigation";
import { adminNavItems } from "@/lib/permissions";
import { useMe } from "@/lib/session";
import { Brand } from "./brand";
import { Icon } from "./icon";
import { SignOutButton } from "./sign-out-button";

/**
 * Frame for /admin/*. It lists only the screens the account may use; each
 * page still checks its own permission, and the API checks every call.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { data: me } = useMe();
  const items = adminNavItems(me);
  const current = items.find((item) => isActivePath(path, item.href));

  return (
    <div className="workspace workspace--admin">
      <aside className="sidebar" aria-label="قائمة الإدارة">
        <Brand href="/admin" tone="light" />
        <div className="sidebar-section-label">لوحة الإدارة</div>
        <nav className="sidebar-nav" aria-label="تنقل الإدارة">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link ${isActivePath(path, item.href) ? "is-active" : ""}`}
              aria-current={isActivePath(path, item.href) ? "page" : undefined}
            >
              <Icon name={item.icon} />
              <span>{item.title}</span>
            </Link>
          ))}
          <Link href="/dashboard" className="sidebar-link sidebar-link--separated">
            <Icon name="home" />
            <span>مساحة الطالب</span>
          </Link>
        </nav>
        <div className="sidebar-bottom">
          <SignOutButton />
        </div>
      </aside>
      <div className="workspace-body">
        <header className="workspace-header">
          <div className="workspace-breadcrumb">
            <span className="workspace-greeting__brand">
              <Brand href="/admin" tagline={false} />
            </span>
            <span>لوحة الإدارة</span>
            <Icon name="chevron" />
            <strong>{current?.title ?? "الإدارة"}</strong>
          </div>
          <div className="workspace-user">
            <span className="user-chip">
              <span className="user-avatar" aria-hidden="true">
                {me?.user.displayName?.trim().charAt(0) || <Icon name="user" />}
              </span>
              <span className="user-chip__name">
                {me?.user.displayName ?? me?.user.email ?? "حساب إداري"}
                <small>صلاحيات إدارية</small>
              </span>
            </span>
            <span className="header-sign-out">
              <SignOutButton tone="light" />
            </span>
          </div>
        </header>
        <nav className="mobile-nav mobile-nav--scroll" aria-label="تنقل الإدارة على الجوال">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActivePath(path, item.href) ? "page" : undefined}
            >
              <Icon name={item.icon} />
              {item.title}
            </Link>
          ))}
          <Link href="/dashboard">
            <Icon name="home" />
            مساحة الطالب
          </Link>
        </nav>
        <div className="workspace-content">{children}</div>
      </div>
    </div>
  );
}
