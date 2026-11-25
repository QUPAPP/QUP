"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { eraseAccount } from "@/lib/api";
import {
  ERASE_PHRASE,
  type EraseAccountForm,
  type EraseAccountFormInput,
  eraseAccountForm,
} from "@/lib/auth-forms";
import { ME_QUERY_KEY } from "@/lib/session";
import { ErrorNotice } from "./status";
import { TextField } from "./text-field";

/**
 * Deleting one's own account (privacy policy, "الإتلاف"). Hidden behind an
 * explicit "I want to delete" step, then the password and a typed phrase, so
 * nobody erases an account with a stray tap.
 */
export function EraseAccountSection() {
  const [open, setOpen] = useState(false);
  const client = useQueryClient();
  const router = useRouter();
  const form = useForm<EraseAccountFormInput, unknown, EraseAccountForm>({
    resolver: zodResolver(eraseAccountForm),
    defaultValues: { password: "", phrase: "" },
  });
  const { errors } = form.formState;
  const erase = useMutation({
    mutationFn: (values: EraseAccountForm) =>
      eraseAccount({ password: values.password, confirmation: "DELETE" }),
    onSuccess: () => {
      client.clear();
      client.setQueryData(ME_QUERY_KEY, null);
      router.replace("/");
    },
  });

  return (
    <section className="card stack account-erase" aria-labelledby="erase-heading">
      <h2 id="erase-heading">حذف الحساب</h2>
      <p className="small muted">
        يُحذف بريدك ورقم جوالك واسمك وكلمة المرور ومحادثاتك مع المساعد نهائيًا، ولا يمكن التراجع.
        نحتفظ بسجل مدفوعاتك كما يطلب النظام، وبإجاباتك دون ما يدل عليك. ينتهي أي اشتراك فعّال مع
        الحساب.
      </p>
      {open ? (
        <form
          className="stack"
          noValidate
          method="post"
          onSubmit={form.handleSubmit((values) => erase.mutate(values))}
        >
          {erase.isError ? <ErrorNotice error={erase.error} /> : null}
          <TextField
            idPrefix="erase"
            label="كلمة المرور"
            type="password"
            registration={form.register("password")}
            error={errors.password?.message}
            autoComplete="current-password"
          />
          <TextField
            idPrefix="erase"
            label={`للتأكيد اكتب: ${ERASE_PHRASE}`}
            registration={form.register("phrase")}
            error={errors.phrase?.message}
            autoComplete="off"
          />
          <div className="row">
            <button type="submit" className="btn btn--danger" disabled={erase.isPending}>
              {erase.isPending ? "جارٍ الحذف…" : "احذف حسابي نهائيًا"}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={erase.isPending}
              onClick={() => {
                form.reset();
                setOpen(false);
              }}
            >
              تراجع
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          className="btn btn--ghost btn--danger-text"
          onClick={() => setOpen(true)}
        >
          أريد حذف حسابي
        </button>
      )}
    </section>
  );
}
