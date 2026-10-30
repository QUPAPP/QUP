"use client";

import { useMutation } from "@tanstack/react-query";
import { Icon } from "@/components/icon";
import { PageHeading } from "@/components/page-heading";
import { SignOutButton } from "@/components/sign-out-button";
import { ErrorNotice, Loading } from "@/components/status";
import { revokeOtherSessions } from "@/lib/api";
import { useCurrentUser, useRequireUser } from "@/lib/session";

export default function AccountPage() {
  const user = useRequireUser();
  const identity = useCurrentUser();
  const revoke = useMutation({ mutationFn: revokeOtherSessions });
  return (
    <main id="main-content" className="page stack stack--loose">
      <PageHeading title="حسابي" description="بيانات حسابك وإدارة جلسات تسجيل الدخول." />
      {identity.isPending ? <Loading /> : null}
      {identity.isError ? <ErrorNotice error={identity.error} /> : null}
      {user ? (
        <div className="profile-grid">
          <section className="card stack">
            <h2>معلوماتك الشخصية</h2>
            <dl className="profile-facts">
              <div>
                <dt>الاسم</dt>
                <dd>{user.displayName || "لم تتم إضافة اسم"}</dd>
              </div>
              <div>
                <dt>البريد الإلكتروني</dt>
                <dd dir={user.email ? "ltr" : undefined}>{user.email ?? "غير مضاف"}</dd>
              </div>
              <div>
                <dt>رقم الجوال</dt>
                <dd dir={user.phone ? "ltr" : undefined}>{user.phone ?? "غير مضاف"}</dd>
              </div>
            </dl>
            <p className="small muted">هذه البيانات هي المسجلة في حسابك.</p>
          </section>
          <section className="card stack account-security">
            <Icon name="lock" />
            <h2>جلسات تسجيل الدخول</h2>
            <p className="small muted">
              إذا استخدمت جهازًا مشتركًا، يمكنك تسجيل الخروج من الأجهزة الأخرى مع إبقاء جلستك الحالية.
            </p>
            {revoke.isError ? <ErrorNotice error={revoke.error} /> : null}
            {revoke.isSuccess ? (
              <p className="notice notice--success" role="status">
                تم تسجيل الخروج من الأجهزة الأخرى.
              </p>
            ) : null}
            <button
              type="button"
              className="btn btn--ghost"
              disabled={revoke.isPending}
              onClick={() => revoke.mutate()}
            >
              {revoke.isPending ? "جارٍ إنهاء الجلسات…" : "تسجيل الخروج من الأجهزة الأخرى"}
            </button>
            <SignOutButton tone="light" />
          </section>
        </div>
      ) : null}
    </main>
  );
}
