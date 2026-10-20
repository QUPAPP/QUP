"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { type AdminExam, createExam, updateExam } from "@/lib/admin-api";
import {
  dropNulls,
  type ExamCreateForm,
  type ExamCreateFormInput,
  type ExamEditForm,
  type ExamEditFormInput,
  examCreateSchema,
  examEditSchema,
} from "@/lib/admin-forms";
import { ErrorNotice } from "../status";
import { TextField } from "../text-field";
import { useSingleFlight } from "./use-single-flight";

export function ExamCreateFormView({ onCreated }: { onCreated: (exam: AdminExam) => void }) {
  const form = useForm<ExamCreateFormInput, unknown, ExamCreateForm>({
    resolver: zodResolver(examCreateSchema),
    defaultValues: { code: "", slug: "", nameAr: "", nameEn: "", description: "" },
  });
  const create = useMutation({
    mutationFn: useSingleFlight((values: ExamCreateForm) => createExam(dropNulls(values))),
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
        label="الاسم بالعربية"
        registration={form.register("nameAr")}
        error={errors.nameAr?.message}
      />
      <TextField
        label="الاسم بالإنجليزية (اختياري)"
        registration={form.register("nameEn")}
        error={errors.nameEn?.message}
        ltr
      />
      <TextField
        label="الرمز"
        hint="ثابت لا يتغير بعد الإنشاء، مثل QUDURAT"
        registration={form.register("code")}
        error={errors.code?.message}
        ltr
      />
      <TextField
        label="الرابط المختصر"
        hint="ثابت لا يتغير بعد الإنشاء، مثل qudurat"
        registration={form.register("slug")}
        error={errors.slug?.message}
        ltr
      />
      <TextField
        label="الوصف (اختياري)"
        registration={form.register("description")}
        error={errors.description?.message}
      />
      <button type="submit" className="btn" disabled={create.isPending}>
        {create.isPending ? "جارٍ الإنشاء…" : "إنشاء الاختبار"}
      </button>
    </form>
  );
}

export function ExamEditFormView({
  exam,
  onSaved,
}: {
  exam: AdminExam;
  onSaved: (exam: AdminExam) => void;
}) {
  const form = useForm<ExamEditFormInput, unknown, ExamEditForm>({
    resolver: zodResolver(examEditSchema),
    defaultValues: {
      nameAr: exam.nameAr,
      nameEn: exam.nameEn ?? "",
      description: exam.description ?? "",
    },
  });
  // Cleared optional fields are sent as null, which clears them on the server.
  const save = useMutation({
    mutationFn: useSingleFlight((values: ExamEditForm) => updateExam(exam.id, values)),
    onSuccess: onSaved,
  });
  const errors = form.formState.errors;

  return (
    <form
      className="admin-form"
      noValidate
      onSubmit={form.handleSubmit((values) => save.mutate(values))}
    >
      {save.isError ? <ErrorNotice error={save.error} /> : null}
      {save.isSuccess && !form.formState.isDirty ? (
        <p className="notice notice--success" role="status">
          حُفظت التغييرات.
        </p>
      ) : null}
      <TextField
        label="الاسم بالعربية"
        registration={form.register("nameAr")}
        error={errors.nameAr?.message}
      />
      <TextField
        label="الاسم بالإنجليزية (اختياري)"
        registration={form.register("nameEn")}
        error={errors.nameEn?.message}
        ltr
      />
      <TextField
        label="الوصف (اختياري)"
        registration={form.register("description")}
        error={errors.description?.message}
      />
      <button type="submit" className="btn" disabled={save.isPending}>
        {save.isPending ? "جارٍ الحفظ…" : "حفظ التغييرات"}
      </button>
    </form>
  );
}
