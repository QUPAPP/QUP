"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { Me } from "@/lib/api";
import { useRequirePermission } from "@/lib/session";
import { EmptyState } from "../empty-state";
import { Loading } from "../status";

/**
 * Renders its children only for an account holding `permission`. Until the
 * session check answers (or while a signed-out visitor is sent to /login) it
 * shows a loading state; an account without the permission sees why, and no
 * admin query runs. The API refuses the calls regardless.
 */
export function AdminGate({
  permission,
  children,
}: {
  permission: string;
  children: (me: Me) => ReactNode;
}) {
  const { me, allowed, ready } = useRequirePermission(permission);

  if (!ready || me === null) {
    return (
      <main id="main-content" className="page">
        <Loading />
      </main>
    );
  }

  if (!allowed) {
    return (
      <main id="main-content" className="page">
        <EmptyState
          icon="lock"
          title="ليس لديك صلاحية"
          description="هذه الصفحة لمن لديه صلاحية إدارة الاختبارات والتصنيف."
        >
          <Link href="/dashboard" className="btn btn--small">
            العودة إلى مساحتي
          </Link>
        </EmptyState>
      </main>
    );
  }

  return children(me);
}
