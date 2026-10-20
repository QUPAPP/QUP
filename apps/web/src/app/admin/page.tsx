"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { EmptyState } from "@/components/empty-state";
import { Loading } from "@/components/status";
import { firstAdminScreen } from "@/lib/permissions";
import { useMe } from "@/lib/session";

/** Opens the panel on the first screen the account may use (taxonomy for admins, questions for authors). */
export default function AdminIndexPage() {
  const router = useRouter();
  const { data: me, isSuccess } = useMe();
  const target = isSuccess ? (me ? firstAdminScreen(me) : "/login") : null;

  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);

  if (isSuccess && me && target === null) {
    return (
      <main id="main-content" className="page">
        <EmptyState
          icon="lock"
          title="ليس لديك صلاحية"
          description="لوحة الإدارة لمن لديه صلاحية إدارة المحتوى."
        />
      </main>
    );
  }
  return (
    <main id="main-content" className="page">
      <Loading />
    </main>
  );
}
