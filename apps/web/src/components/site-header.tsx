"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isAdminPath, isWorkspacePath } from "@/lib/navigation";
import { hasAdminAccess, homePath } from "@/lib/permissions";
import { useMe } from "@/lib/session";
import { Brand } from "./brand";
import { Icon } from "./icon";

const sections = [
  { href: "/#why-qup", title: "لماذا QUP؟" },
  { href: "/#how-it-works", title: "كيف يعمل" },
  { href: "/#report", title: "مساحتك" },
  { href: "/#questions", title: "أسئلة شائعة" },
];

export function SiteHeader() {
  const { data: me } = useMe();
  const path = usePathname();
  // Sign-in pages carry the logo in their own photo panel.
  if (isWorkspacePath(path) || isAdminPath(path) || path === "/login" || path === "/register")
    return null;
  // On the home page the header floats over the hero photograph.
  const overlay = path === "/";
  return (
    <header className={`site-header ${overlay ? "site-header--overlay" : ""}`}>
      <div className="site-header__inner">
        <Brand tone={overlay ? "light" : "dark"} />
        <nav className="public-nav" aria-label="أقسام الصفحة">
          {sections.map((section) => (
            <a key={section.href} href={section.href}>
              {section.title}
            </a>
          ))}
        </nav>
        <div className="site-header__actions">
          {me ? (
            <Link href={homePath(me)} className="btn btn--gold btn--small">
              {hasAdminAccess(me) ? "لوحة الإدارة" : "مساحتي"} <Icon name="arrow" />
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="header-login"
                aria-current={path === "/login" ? "page" : undefined}
              >
                دخول
              </Link>
              <Link href="/register" className="btn btn--gold btn--small">
                ابدأ مجانًا <Icon name="arrow" />
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
