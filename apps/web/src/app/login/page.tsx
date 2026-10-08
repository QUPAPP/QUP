"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";

import { ErrorNotice } from "@/components/status";
import { TextField } from "@/components/text-field";
import { login } from "@/lib/api";
import { type LoginForm, loginForm } from "@/lib/auth-forms";
import { ME_QUERY_KEY } from "@/lib/session";

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const form = useForm<LoginForm>({
    resolver: zodResolver(loginForm),
    defaultValues: { identifier: "", password: "" },
  });

  const signIn = useMutation({
    mutationFn: login,
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
        onSubmit={form.handleSubmit((values) => signIn.mutate(values))}
      >
        <h1>تسجيل الدخول</h1>
        {signIn.isError ? <ErrorNotice error={signIn.error} /> : null}
        <TextField
          label="البريد الإلكتروني أو رقم الجوال"
          registration={form.register("identifier")}
          error={form.formState.errors.identifier?.message}
          autoComplete="username"
          ltr
        />
        <TextField
          label="كلمة المرور"
          type="password"
          registration={form.register("password")}
          error={form.formState.errors.password?.message}
          autoComplete="current-password"
          ltr
        />
        <button type="submit" className="btn btn--block" disabled={signIn.isPending}>
          {signIn.isPending ? "جارٍ الدخول…" : "دخول"}
        </button>
        <p className="small muted">
          ليس لديك حساب؟ <Link href="/register">أنشئ حسابًا مجانيًا</Link>
        </p>
      </form>
    </main>
  );
}
