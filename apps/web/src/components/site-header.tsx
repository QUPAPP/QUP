"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isWorkspacePath } from "@/lib/navigation";
import { useCurrentUser } from "@/lib/session";
import { Brand } from "./brand";
import { Icon } from "./icon";

export function SiteHeader() {
  const { data: user } = useCurrentUser();
  const path = usePathname();
  if (isWorkspacePath(path)) return null;
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Brand />
        <nav className="public-nav" aria-label="التنقل">
          <a href="/#how-it-works">كيف يعمل؟</a>
          <a href="/#why-qup">لماذا QUP؟</a>
          <a href="/#questions">أسئلة شائعة</a>
        </nav>
        <div className="site-header__actions">
          {user ? (
            <Link href="/dashboard" className="btn btn--small">
              مساحتي <Icon name="arrow" />
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
              <Link href="/register" className="btn btn--small">
                ابدأ مجانًا <Icon name="arrow" />
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
