"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { type UseMutationResult, useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { AuthLayout } from "@/components/auth-layout";
import { HumanCheck, useHumanCheckSiteKey } from "@/components/human-check";
import { ResendButton } from "@/components/resend-code";
import { ErrorNotice } from "@/components/status";
import { TextField } from "@/components/text-field";
import { type CodeRequested, forgotPassword, resetPassword } from "@/lib/api";
import {
  type ForgotForm,
  forgotForm,
  type ResetForm,
  type ResetFormInput,
  resetForm,
} from "@/lib/auth-forms";
import { retryAfterSeconds, useResendCountdown } from "@/lib/resend-countdown";

/**
 * Forgot password, in two steps on one page: the address, then the mailed code
 * with the new password. The first step answers the same whether or not the
 * address has an account (the API guarantees it), so the wording here never
 * says "we sent it" as a fact — only "if there is an account".
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState<string | null>(null);
  const countdown = useResendCountdown();

  const request = useMutation({
    mutationFn: forgotPassword,
    onSuccess: (answer) => countdown.start(answer.resendAfterSeconds),
    onError: (error) => {
      const wait = retryAfterSeconds(error);
      if (wait !== null) countdown.start(wait);
    },
  });

  return (
    <AuthLayout>
      {email === null ? (
        <EmailStep request={request} onSent={setEmail} />
      ) : (
        <ResetStep
          email={email}
          countdown={countdown}
          resend={(captchaToken) => request.mutate({ email, captchaToken })}
          resending={request.isPending}
          resendError={
            request.isError && retryAfterSeconds(request.error) === null ? request.error : null
          }
          onChangeEmail={() => setEmail(null)}
        />
      )}
    </AuthLayout>
  );
}

function EmailStep({
  request,
  onSent,
}: {
  request: UseMutationResult<CodeRequested, Error, { email: string; captchaToken?: string | null }>;
  onSent: (email: string) => void;
}) {
  const form = useForm<ForgotForm>({
    resolver: zodResolver(forgotForm),
    defaultValues: { email: "" },
  });
  const siteKey = useHumanCheckSiteKey();
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  return (
    <form
      className="auth-form"
      method="post"
      noValidate
      onSubmit={form.handleSubmit((values) =>
        request.mutate(
          { email: values.email, captchaToken },
          {
            onSuccess: () => onSent(values.email),
            onError: () => {
              setCaptchaToken(null);
              setAttempt((n) => n + 1);
            },
          },
        ),
      )}
    >
      <div className="auth-form-heading">
        <h1>نسيت كلمة المرور؟</h1>
        <p>اكتب بريدك الإلكتروني وسنرسل لك رمزًا لتعيين كلمة مرور جديدة.</p>
      </div>
      {request.isError && retryAfterSeconds(request.error) === null ? (
        <ErrorNotice error={request.error} />
      ) : null}
      <TextField
        label="البريد الإلكتروني"
        registration={form.register("email")}
        error={form.formState.errors.email?.message}
        autoComplete="email"
        inputMode="email"
        ltr
      />
      {siteKey ? (
        <HumanCheck
          key={attempt}
          siteKey={siteKey}
          action="forgot-password"
          onToken={setCaptchaToken}
        />
      ) : null}
      <button
        type="submit"
        className="btn btn--block"
        disabled={request.isPending || (siteKey !== null && captchaToken === null)}
      >
        {request.isPending ? "جارٍ الإرسال…" : "أرسل الرمز"}
      </button>
      <p className="auth-form-foot">
        سجّلت برقم الجوال فقط؟ الاستعادة بالبريد وحده حاليًا، فتواصل مع الدعم.
      </p>
      <p className="auth-form-foot">
        تذكّرتها؟ <Link href="/login">سجّل الدخول</Link>
      </p>
    </form>
  );
}

function ResetStep({
  email,
  countdown,
  resend,
  resending,
  resendError,
  onChangeEmail,
}: {
  email: string;
  countdown: { seconds: number };
  /** Mails a new code; carries a fresh human-check token when the deployment has the check. */
  resend: (captchaToken: string | null) => void;
  resending: boolean;
  resendError: unknown;
  onChangeEmail: () => void;
}) {
  const form = useForm<ResetFormInput, unknown, ResetForm>({
    resolver: zodResolver(resetForm),
    defaultValues: { code: "", newPassword: "", confirmPassword: "" },
  });
  const siteKey = useHumanCheckSiteKey();
  const [resendToken, setResendToken] = useState<string | null>(null);
  const [resendAttempt, setResendAttempt] = useState(0);
  const reset = useMutation({
    mutationFn: (values: ResetForm) =>
      resetPassword({ email, code: values.code, newPassword: values.newPassword }),
  });

  if (reset.isSuccess) {
    return (
      <div className="auth-form">
        <div className="auth-form-heading">
          <h1>تم تعيين كلمة المرور.</h1>
          <p>سجّلنا خروجك من كل الأجهزة. سجّل الدخول الآن بكلمة المرور الجديدة.</p>
        </div>
        <Link href="/login" className="btn btn--block">
          تسجيل الدخول
        </Link>
      </div>
    );
  }

  return (
    <form
      className="auth-form"
      method="post"
      noValidate
      onSubmit={form.handleSubmit((values) => reset.mutate(values))}
    >
      <div className="auth-form-heading">
        <h1>أدخل الرمز.</h1>
        <p role="status">
          إن كان لـ <bdi dir="ltr">{email}</bdi> حساب فقد أرسلنا إليه رمزًا من ٦ أرقام، صلاحيته ١٠
          دقائق. تحقق من البريد غير الهام إن لم تجده.
        </p>
      </div>
      {reset.isError ? <ErrorNotice error={reset.error} /> : null}
      {resendError ? <ErrorNotice error={resendError} /> : null}
      <TextField
        idPrefix="reset"
        label="الرمز"
        registration={form.register("code")}
        error={form.formState.errors.code?.message}
        autoComplete="one-time-code"
        inputMode="numeric"
        inputClassName="code-input"
        ltr
      />
      <TextField
        idPrefix="reset"
        label="كلمة المرور الجديدة"
        type="password"
        hint="١٢ حرفًا على الأقل."
        registration={form.register("newPassword")}
        error={form.formState.errors.newPassword?.message}
        autoComplete="new-password"
        ltr
      />
      <TextField
        idPrefix="reset"
        label="تأكيد كلمة المرور"
        type="password"
        registration={form.register("confirmPassword")}
        error={form.formState.errors.confirmPassword?.message}
        autoComplete="new-password"
        ltr
      />
      <button type="submit" className="btn btn--block" disabled={reset.isPending}>
        {reset.isPending ? "جارٍ الحفظ…" : "عيّن كلمة المرور"}
      </button>
      {siteKey && countdown.seconds === 0 ? (
        <HumanCheck
          key={resendAttempt}
          siteKey={siteKey}
          action="forgot-password"
          onToken={setResendToken}
        />
      ) : null}
      <div className="row auth-form-actions">
        <ResendButton
          seconds={countdown.seconds}
          pending={resending || (siteKey !== null && resendToken === null)}
          onResend={() => {
            resend(resendToken);
            // Each token is good for one check: draw a new one for the next resend.
            setResendToken(null);
            setResendAttempt((n) => n + 1);
          }}
        />
        <button type="button" className="text-link" onClick={onChangeEmail}>
          بريد آخر
        </button>
      </div>
    </form>
  );
}
