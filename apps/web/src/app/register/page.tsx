"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";

import { ErrorNotice } from "@/components/status";
import { TextField } from "@/components/text-field";
import { register as registerAccount } from "@/lib/api";
import { type RegisterForm, type RegisterFormInput, registerForm } from "@/lib/auth-forms";
import { ME_QUERY_KEY } from "@/lib/session";

export default function RegisterPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const form = useForm<RegisterFormInput, unknown, RegisterForm>({
    resolver: zodResolver(registerForm),
    defaultValues: { displayName: "", email: "", phone: "", password: "" },
  });
  const { errors } = form.formState;

  const signUp = useMutation({
    mutationFn: (values: RegisterForm) =>
      registerAccount({
        password: values.password,
        ...(values.email ? { email: values.email } : {}),
        ...(values.phone ? { phone: values.phone } : {}),
        ...(values.displayName ? { displayName: values.displayName } : {}),
      }),
    onSuccess: ({ user }) => {
      queryClient.setQueryData(ME_QUERY_KEY, user);
      router.replace("/exams");
    },
  });

  return (
    <main className="page">
      <form
        className="card stack"
        noValidate
        onSubmit={form.handleSubmit((values) => signUp.mutate(values))}
      >
        <h1>إنشاء حساب</h1>
        <p className="muted">سجّل بالبريد الإلكتروني أو رقم الجوال — أحدهما يكفي.</p>
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
          hint="بالصيغة الدولية، مثل ‎+9665XXXXXXXX"
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
        <button type="submit" className="btn btn--block" disabled={signUp.isPending}>
          {signUp.isPending ? "جارٍ إنشاء الحساب…" : "إنشاء الحساب"}
        </button>
        <p className="small muted">
          لديك حساب؟ <Link href="/login">سجّل الدخول</Link>
        </p>
      </form>
    </main>
  );
}
