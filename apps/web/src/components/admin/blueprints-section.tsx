"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { createBlueprint, listBlueprints } from "@/lib/blueprint-api";
import {
  type BlueprintCreateForm,
  type BlueprintCreateFormInput,
  blueprintCreateSchema,
} from "@/lib/blueprint-form";
import { DIAGNOSTIC_TITLES } from "@/lib/diagnostics";
import { Icon } from "../icon";
import { ErrorNotice, Loading } from "../status";
import { TextField } from "../text-field";
import { StatusBadge } from "./status-badge";
import { useSingleFlight } from "./use-single-flight";

/** An exam's diagnostic blueprints, and a form to start a new draft (B2). */
export function BlueprintsSection({
  userId,
  examId,
  versionCodes,
}: {
  userId: string;
  examId: string;
  /** Taxonomy version labels by id, from the versions this page already lists. */
  versionCodes: ReadonlyMap<string, string>;
}) {
  const blueprints = useQuery({
    queryKey: ["admin-blueprints", userId, examId],
    queryFn: () => listBlueprints(examId),
  });

  return (
    <section className="card stack" aria-labelledby="blueprints-heading">
      <h2 id="blueprints-heading">نماذج التشخيص</h2>
      <p className="small muted">
        النموذج يحدد عدد أسئلة التشخيص ووزن كل مجال. يُكتب مسودة ثم يُفعَّل؛ النموذج النشط للقراءة فقط،
        وأي تغيير يكون في نموذج جديد. بلا نموذج نشط تُستخدم القيم الافتراضية.
      </p>
      {blueprints.isPending ? <Loading /> : null}
      {blueprints.isError ? <ErrorNotice error={blueprints.error} /> : null}
      {blueprints.data?.items.length === 0 ? <p className="muted">لا توجد نماذج بعد.</p> : null}
      {blueprints.data && blueprints.data.items.length > 0 ? (
        <ul className="list">
          {blueprints.data.items.map((blueprint) => (
            <li key={blueprint.id} className="admin-row">
              <Link href={`/admin/blueprints/${blueprint.id}`} className="admin-row__main">
                <strong>{`${DIAGNOSTIC_TITLES[blueprint.type]} — ${blueprint.name}`}</strong>
                <span className="small muted">
                  {`${blueprint.questionCount} سؤالًا · `}
                  <bdi dir="ltr">{blueprint.code}</bdi>
                  {" · نسخة التصنيف "}
                  <bdi dir="ltr">{versionCodes.get(blueprint.taxonomyVersionId) ?? "—"}</bdi>
                </span>
              </Link>
              <StatusBadge status={blueprint.status} />
              <Icon name="chevron" />
            </li>
          ))}
        </ul>
      ) : null}
      <h3>نموذج مسودة جديد</h3>
      <BlueprintCreateFormView userId={userId} examId={examId} />
    </section>
  );
}

function BlueprintCreateFormView({ userId, examId }: { userId: string; examId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const form = useForm<BlueprintCreateFormInput, unknown, BlueprintCreateForm>({
    resolver: zodResolver(blueprintCreateSchema),
    defaultValues: { type: "FULL_DIAGNOSTIC", code: "", name: "", questionCount: "" },
  });
  const send = useSingleFlight((values: BlueprintCreateForm) => createBlueprint(examId, values));
  const create = useMutation({
    mutationFn: send,
    onSuccess: async (blueprint) => {
      await queryClient.invalidateQueries({ queryKey: ["admin-blueprints", userId, examId] });
      router.push(`/admin/blueprints/${blueprint.id}`);
    },
  });
  const errors = form.formState.errors;

  return (
    <form
      className="admin-form"
      noValidate
      onSubmit={form.handleSubmit((values) => create.mutate(values))}
    >
      {create.isError ? <ErrorNotice error={create.error} /> : null}
      <div className="field">
        <label className="field__label" htmlFor="blueprint-type">
          نوع التشخيص
        </label>
        <select id="blueprint-type" className="field__input" {...form.register("type")}>
          <option value="FULL_DIAGNOSTIC">{DIAGNOSTIC_TITLES.FULL_DIAGNOSTIC}</option>
          <option value="MINI_DIAGNOSTIC">{DIAGNOSTIC_TITLES.MINI_DIAGNOSTIC}</option>
        </select>
      </div>
      <TextField
        idPrefix="blueprint"
        label="رمز النموذج"
        hint="مثل FULL-2026"
        registration={form.register("code")}
        error={errors.code?.message}
        ltr
      />
      <TextField
        idPrefix="blueprint"
        label="اسم النموذج"
        registration={form.register("name")}
        error={errors.name?.message}
      />
      <TextField
        idPrefix="blueprint"
        label="عدد الأسئلة"
        hint="للتشخيص كله: الأسئلة التي أجاب عنها الطالب سابقًا تُحسب منه."
        inputMode="numeric"
        registration={form.register("questionCount")}
        error={errors.questionCount?.message}
        ltr
      />
      <button type="submit" className="btn" disabled={create.isPending}>
        {create.isPending ? "جارٍ الإنشاء…" : "إنشاء نموذج مسودة"}
      </button>
    </form>
  );
}
