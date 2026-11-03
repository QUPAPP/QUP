"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { PageHeading } from "@/components/page-heading";
import { SignOutButton } from "@/components/sign-out-button";
import { ErrorNotice, Loading } from "@/components/status";
import { TextField } from "@/components/text-field";
import { changePassword, revokeOtherSessions, type User, updateProfile } from "@/lib/api";
import { type PasswordForm, type ProfileForm, passwordForm, profileForm } from "@/lib/auth-forms";
import { ME_QUERY_KEY, useCurrentUser, useRequireUser } from "@/lib/session";

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
            <NameForm user={user} />
            <dl className="profile-facts">
              <div>
                <dt>البريد الإلكتروني</dt>
                <dd>{user.email ? <bdi dir="ltr">{user.email}</bdi> : "غير مضاف"}</dd>
              </div>
              <div>
                <dt>رقم الجوال</dt>
                <dd>{user.phone ? <bdi dir="ltr">{user.phone}</bdi> : "غير مضاف"}</dd>
              </div>
            </dl>
            <p className="small muted">
              البريد ورقم الجوال هما ما تسجّل الدخول به، ولتغييرهما تواصل مع الدعم.
            </p>
          </section>
          <section className="card stack account-security">
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
          <PasswordSection />
        </div>
      ) : null}
    </main>
  );
}

function NameForm({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const form = useForm<ProfileForm>({
    resolver: zodResolver(profileForm),
    defaultValues: { displayName: user.displayName ?? "" },
  });
  const save = useMutation({
    mutationFn: updateProfile,
    onSuccess: async ({ user: saved }) => {
      form.reset({ displayName: saved.displayName ?? "" });
      await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
    },
  });

  return (
    <form
      className="stack"
      noValidate
      method="post"
      onSubmit={form.handleSubmit((values) => save.mutate(values))}
    >
      {save.isError ? <ErrorNotice error={save.error} /> : null}
      <TextField
        idPrefix="profile"
        label="الاسم"
        hint="يظهر في ترحيب لوحتك. اتركه فارغًا إن أردت."
        registration={form.register("displayName")}
        error={form.formState.errors.displayName?.message}
        autoComplete="name"
      />
      <div className="row">
        <button
          type="submit"
          className="btn btn--small"
          disabled={save.isPending || !form.formState.isDirty}
        >
          {save.isPending ? "جارٍ الحفظ…" : "حفظ الاسم"}
        </button>
        {save.isSuccess && !form.formState.isDirty ? (
          <span className="small muted" role="status">
            تم الحفظ.
          </span>
        ) : null}
      </div>
    </form>
  );
}

function PasswordSection() {
  const form = useForm<PasswordForm>({
    resolver: zodResolver(passwordForm),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });
  const { errors } = form.formState;
  const change = useMutation({
    mutationFn: (values: PasswordForm) =>
      changePassword({ currentPassword: values.currentPassword, newPassword: values.newPassword }),
    onSuccess: () => form.reset(),
  });

  return (
    <section className="card stack" aria-labelledby="password-heading">
      <h2 id="password-heading">تغيير كلمة المرور</h2>
      <p className="small muted">
        بعد التغيير نُخرج حسابك من كل الأجهزة الأخرى، وتبقى جلستك هذه كما هي.
      </p>
      <form
        className="stack"
        noValidate
        method="post"
        onSubmit={form.handleSubmit((values) => change.mutate(values))}
      >
        {change.isError ? <ErrorNotice error={change.error} /> : null}
        {change.isSuccess ? (
          <p className="notice notice--success" role="status">
            تم تغيير كلمة المرور، وخرجنا من الأجهزة الأخرى.
          </p>
        ) : null}
        <TextField
          idPrefix="password"
          label="كلمة المرور الحالية"
          type="password"
          registration={form.register("currentPassword")}
          error={errors.currentPassword?.message}
          autoComplete="current-password"
        />
        <TextField
          idPrefix="password"
          label="كلمة المرور الجديدة"
          type="password"
          hint="12 حرفًا على الأقل. جملة سهلة التذكر أفضل من كلمة معقدة."
          registration={form.register("newPassword")}
          error={errors.newPassword?.message}
          autoComplete="new-password"
        />
        <TextField
          idPrefix="password"
          label="تأكيد كلمة المرور الجديدة"
          type="password"
          registration={form.register("confirmPassword")}
          error={errors.confirmPassword?.message}
          autoComplete="new-password"
        />
        <button type="submit" className="btn" disabled={change.isPending}>
          {change.isPending ? "جارٍ التغيير…" : "تغيير كلمة المرور"}
        </button>
      </form>
    </section>
  );
}
