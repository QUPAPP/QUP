"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { AuthLayout } from "@/components/auth-layout";
import { HumanCheck, useHumanCheckSiteKey } from "@/components/human-check";
import { Icon } from "@/components/icon";
import { ErrorNotice } from "@/components/status";
import { TextField } from "@/components/text-field";
import { register as registerAccount } from "@/lib/api";
import { type RegisterForm, type RegisterFormInput, registerForm } from "@/lib/auth-forms";
import { LEGAL_UPDATED_AT } from "@/lib/legal";
import { startSession } from "@/lib/session";

export default function RegisterPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const form = useForm<RegisterFormInput, unknown, RegisterForm>({
    resolver: zodResolver(registerForm),
    defaultValues: { displayName: "", email: "", phone: "", password: "", acceptTerms: false },
  });
  const { errors } = form.formState;
  const siteKey = useHumanCheckSiteKey();
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  // A token is good for one check: after a refused sign-up the widget is drawn again.
  const [attempt, setAttempt] = useState(0);

  const signUp = useMutation({
    mutationFn: (values: RegisterForm) =>
      registerAccount({
        password: values.password,
        acceptedTermsVersion: LEGAL_UPDATED_AT,
        ...(captchaToken ? { captchaToken } : {}),
        ...(values.email ? { email: values.email } : {}),
        ...(values.phone ? { phone: values.phone } : {}),
        ...(values.displayName ? { displayName: values.displayName } : {}),
      }),
    onSuccess: async () => {
      await startSession(queryClient);
      router.replace("/exams");
    },
    onError: () => {
      setCaptchaToken(null);
      setAttempt((n) => n + 1);
    },
  });
  const waitingForCheck = siteKey !== null && captchaToken === null;

  return (
    <AuthLayout register>
      <form
        className="auth-form"
        method="post"
        noValidate
        onSubmit={form.handleSubmit((values) => signUp.mutate(values))}
      >
        <div className="auth-form-heading">
          <h1>خطوتك الأولى تبدأ هنا.</h1>
          <p>أنشئ حسابك بالبريد الإلكتروني أو رقم الجوال — أحدهما يكفي.</p>
        </div>
        {signUp.isError ? <ErrorNotice error={signUp.error} /> : null}
        <TextField
          label="الاسم (اختياري)"
          registration={form.register("displayName")}
          error={errors.displayName?.message}
          autoComplete="name"
        />
        <TextField
          label="البريد الإلكتروني"
          type="email"
          registration={form.register("email")}
          error={errors.email?.message}
          autoComplete="email"
          inputMode="email"
          ltr
        />
        <TextField
          label="رقم الجوال"
          type="tel"
          hint="مثل 05XXXXXXXX أو ‎+9665XXXXXXXX"
          registration={form.register("phone")}
          error={errors.phone?.message}
          autoComplete="tel"
          inputMode="tel"
          ltr
        />
        <TextField
          label="كلمة المرور"
          type="password"
          hint="12 حرفًا على الأقل. جملة سهلة التذكر أفضل من كلمة معقدة."
          registration={form.register("password")}
          error={errors.password?.message}
          autoComplete="new-password"
          ltr
        />
        <div className="auth-consent-field">
          <label className="checkbox auth-consent">
            <input
              type="checkbox"
              aria-invalid={errors.acceptTerms ? true : undefined}
              aria-describedby={errors.acceptTerms ? "accept-terms-error" : undefined}
              {...form.register("acceptTerms")}
            />
            <span>
              قرأت{" "}
              <Link href="/terms" target="_blank">
                الشروط والأحكام
              </Link>{" "}
              و
              <Link href="/privacy" target="_blank">
                سياسة الخصوصية
              </Link>{" "}
              وأوافق عليهما.
            </span>
          </label>
          {errors.acceptTerms ? (
            <p className="field__error" id="accept-terms-error" role="alert">
              {errors.acceptTerms.message}
            </p>
          ) : null}
        </div>
        {siteKey ? (
          <HumanCheck key={attempt} siteKey={siteKey} action="register" onToken={setCaptchaToken} />
        ) : null}
        <button
          type="submit"
          className="btn btn--block"
          disabled={signUp.isPending || waitingForCheck}
        >
          {signUp.isPending ? "جارٍ إنشاء الحساب…" : "إنشاء الحساب"}
        </button>
        <p className="auth-form-foot">
          لديك حساب؟ <Link href="/login">سجّل الدخول</Link>
        </p>
        <p className="auth-security">
          <Icon name="check" />
          التشخيص المصغّر مجاني بعد التسجيل
        </p>
      </form>
    </AuthLayout>
  );
}
