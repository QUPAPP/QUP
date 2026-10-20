"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { createTaxonomyVersion, type TaxonomyVersion } from "@/lib/admin-api";
import {
  dropNulls,
  type VersionCreateForm,
  type VersionCreateFormInput,
  versionCreateSchema,
} from "@/lib/admin-forms";
import { ErrorNotice } from "../status";
import { TextField } from "../text-field";
import { useSingleFlight } from "./use-single-flight";

export function VersionCreateFormView({
  examId,
  onCreated,
}: {
  examId: string;
  onCreated: (version: TaxonomyVersion) => void;
}) {
  const form = useForm<VersionCreateFormInput, unknown, VersionCreateForm>({
    resolver: zodResolver(versionCreateSchema),
    defaultValues: { versionCode: "", effectiveFrom: "" },
  });
  const create = useMutation({
    mutationFn: useSingleFlight((values: VersionCreateForm) =>
      createTaxonomyVersion(examId, dropNulls(values)),
    ),
    onSuccess: onCreated,
  });
  const errors = form.formState.errors;

  return (
    <form
      className="admin-form"
      noValidate
      onSubmit={form.handleSubmit((values) => create.mutate(values))}
    >
      {create.isError ? <ErrorNotice error={create.error} /> : null}
      <TextField
        label="رمز النسخة"
        hint="مثل 2026.1"
        registration={form.register("versionCode")}
        error={errors.versionCode?.message}
        ltr
      />
      <TextField
        label="تاريخ السريان (اختياري)"
        type="date"
        registration={form.register("effectiveFrom")}
        error={errors.effectiveFrom?.message}
        ltr
      />
      <button type="submit" className="btn" disabled={create.isPending}>
        {create.isPending ? "جارٍ الإنشاء…" : "إنشاء نسخة مسودة"}
      </button>
    </form>
  );
}
