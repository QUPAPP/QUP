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
    <div className="workspace">
      <aside className="sidebar" aria-label="قائمة الإدارة">
        <Brand href="/admin/exams" />
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
              <Icon name="chevron" className="nav-chevron" />
            </Link>
          ))}
          <Link href="/dashboard" className="sidebar-link">
            <Icon name="grid" />
            <span>العودة إلى مساحتي</span>
            <Icon name="chevron" className="nav-chevron" />
          </Link>
        </nav>
        <div className="sidebar-bottom">
          <SignOutButton />
          <span className="small muted">QUP · لوحة الإدارة</span>
        </div>
      </aside>
      <div className="workspace-body">
        <header className="workspace-header">
          <div className="workspace-breadcrumb">
            <span>لوحة الإدارة</span>
            <Icon name="chevron" />
            <strong>{current?.title ?? "الإدارة"}</strong>
          </div>
          <div className="workspace-user">
            <span className="user-avatar" aria-hidden="true">
              {me?.user.displayName?.trim().charAt(0) || <Icon name="user" />}
            </span>
            <span>{me?.user.displayName ?? me?.user.email ?? "حساب إداري"}</span>
            <span className="session-indicator">صلاحيات إدارية</span>
          </div>
        </header>
        <nav className="mobile-nav" aria-label="تنقل الإدارة على الجوال">
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
            <Icon name="grid" />
            مساحتي
          </Link>
        </nav>
        <div className="workspace-content">{children}</div>
      </div>
    </div>
  );
}
