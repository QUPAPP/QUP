"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { AdminGate } from "@/components/admin/admin-gate";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { StatusBadge } from "@/components/admin/status-badge";
import { useSingleFlight } from "@/components/admin/use-single-flight";
import { Icon } from "@/components/icon";
import { PageHeading } from "@/components/page-heading";
import { ErrorNotice, Loading } from "@/components/status";
import { TextField } from "@/components/text-field";
import {
  activateBlueprint,
  archiveBlueprint,
  type Blueprint,
  getBlueprint,
  updateBlueprint,
} from "@/lib/blueprint-api";
import {
  type BlueprintEditForm,
  type BlueprintEditFormInput,
  blueprintEditSchema,
  formFromBlueprint,
  toUpdateBody,
} from "@/lib/blueprint-form";
import { DIAGNOSTIC_TITLES } from "@/lib/diagnostics";
import { ADMIN_PERMISSIONS } from "@/lib/permissions";

export default function AdminBlueprintPage() {
  const { blueprintId } = useParams<{ blueprintId: string }>();
  return (
    <AdminGate permission={ADMIN_PERMISSIONS.blueprintsManage}>
      {(me) => <BlueprintAdmin userId={me.user.id} blueprintId={blueprintId} />}
    </AdminGate>
  );
}

function BlueprintAdmin({ userId, blueprintId }: { userId: string; blueprintId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["admin-blueprint", userId, blueprintId];
  const blueprint = useQuery({ queryKey, queryFn: () => getBlueprint(blueprintId) });
  const show = (saved: Blueprint) => {
    queryClient.setQueryData(queryKey, saved);
    void queryClient.invalidateQueries({ queryKey: ["admin-blueprints", userId, saved.examId] });
  };
  const sendActivate = useSingleFlight(() => activateBlueprint(blueprintId));
  const activate = useMutation({ mutationFn: sendActivate, onSuccess: show });
  const sendArchive = useSingleFlight(() => archiveBlueprint(blueprintId));
  const archive = useMutation({ mutationFn: sendArchive, onSuccess: show });

  if (blueprint.isPending) {
    return (
      <main id="main-content" className="page">
        <Loading />
      </main>
    );
  }
  if (blueprint.isError) {
    return (
      <main id="main-content" className="page">
        <ErrorNotice error={blueprint.error}>
          <Link href="/admin/exams" className="btn btn--small">
            كل الاختبارات
          </Link>
        </ErrorNotice>
      </main>
    );
  }

  const current = blueprint.data;
  const typeTitle = DIAGNOSTIC_TITLES[current.type];
  const lifecycleError = activate.error ?? archive.error;
  return (
    <main id="main-content" className="page stack stack--loose">
      <Link href={`/admin/exams/${current.examId}`} className="text-link">
        الاختبار <Icon name="arrow" />
      </Link>
      <PageHeading
        title={current.name}
        description={`${typeTitle} · الرمز ${current.code} · نسخة التصنيف ${current.taxonomyVersion.versionCode}`}
        action={<StatusBadge status={current.status} />}
      />

      {current.status === "DRAFT" ? (
        <DraftForm blueprint={current} onSaved={show} />
      ) : (
        <ReadOnlyBlueprint blueprint={current} />
      )}

      {current.status === "ARCHIVED" ? null : (
        <section className="card stack" aria-labelledby="lifecycle-heading">
          <h2 id="lifecycle-heading">الحالة</h2>
          {lifecycleError ? <ErrorNotice error={lifecycleError} /> : null}
          <div className="stack">
            {current.status === "DRAFT" ? (
              <ConfirmAction
                label="تفعيل النموذج"
                description={`يصبح هذا النموذج هو المعتمد لـ${typeTitle} في هذا الاختبار، ويُؤرشف النموذج النشط السابق. لا يمكن تعديله بعد التفعيل. يسري على الجلسات الجديدة فقط.`}
                pending={activate.isPending}
                onConfirm={() => activate.mutate()}
              />
            ) : null}
            <ConfirmAction
              label="أرشفة النموذج"
              description="الأرشفة نهائية. الجلسات السابقة تبقى مرتبطة به، والجلسات الجديدة تتبع نموذجًا نشطًا آخر أو القيم الافتراضية."
              danger
              pending={archive.isPending}
              onConfirm={() => archive.mutate()}
            />
          </div>
        </section>
      )}
    </main>
  );
}

function DraftForm({
  blueprint,
  onSaved,
}: {
  blueprint: Blueprint;
  onSaved: (saved: Blueprint) => void;
}) {
  const form = useForm<BlueprintEditFormInput, unknown, BlueprintEditForm>({
    resolver: zodResolver(blueprintEditSchema),
    defaultValues: formFromBlueprint(blueprint),
  });
  // A newer save arrived: show it, keeping any message on screen.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the blueprint changes
  useEffect(() => {
    form.reset(formFromBlueprint(blueprint));
  }, [blueprint.updatedAt]);
  const send = useSingleFlight((values: BlueprintEditForm) =>
    updateBlueprint(blueprint.id, toUpdateBody(blueprint, values)),
  );
  const save = useMutation({ mutationFn: send, onSuccess: onSaved });
  const errors = form.formState.errors;

  return (
    <section className="card stack" aria-labelledby="draft-heading">
      <h2 id="draft-heading">المسودة</h2>
      {save.isError ? <ErrorNotice error={save.error} /> : null}
      {save.isSuccess ? (
        <p className="notice notice--success" role="status">
          حُفظت المسودة.
        </p>
      ) : null}
      <form
        className="admin-form"
        noValidate
        onSubmit={form.handleSubmit((values) => save.mutate(values))}
      >
        <TextField
          idPrefix="blueprint-edit"
          label="اسم النموذج"
          registration={form.register("name")}
          error={errors.name?.message}
        />
        <TextField
          idPrefix="blueprint-edit"
          label="عدد الأسئلة"
          hint="للتشخيص كله: الأسئلة التي أجاب عنها الطالب سابقًا تُحسب منه."
          inputMode="numeric"
          registration={form.register("questionCount")}
          error={errors.questionCount?.message}
          ltr
        />
        <fieldset className="stack">
          <legend className="field__label">أوزان المجالات</legend>
          <p className="small muted">اتركه فارغًا لوزن التصنيف، و0 لاستبعاد المجال.</p>
          {blueprint.domains.map((domain, index) => {
            const id = `weight-${domain.id}`;
            const error = errors.weights?.[index]?.message;
            return (
              <div key={domain.id} className="field">
                <label className="field__label" htmlFor={id}>
                  {`${domain.name} (وزن التصنيف ${domain.taxonomyWeight})`}
                </label>
                <input
                  id={id}
                  className="field__input"
                  dir="ltr"
                  inputMode="decimal"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${id}-error` : undefined}
                  {...form.register(`weights.${index}` as const)}
                />
                {error ? (
                  <span id={`${id}-error`} className="field__error" role="alert">
                    {error}
                  </span>
                ) : null}
              </div>
            );
          })}
        </fieldset>
        <button type="submit" className="btn" disabled={save.isPending}>
          {save.isPending ? "جارٍ الحفظ…" : "حفظ المسودة"}
        </button>
      </form>
    </section>
  );
}

function ReadOnlyBlueprint({ blueprint }: { blueprint: Blueprint }) {
  return (
    <section className="card stack" aria-labelledby="recipe-heading">
      <h2 id="recipe-heading">النموذج</h2>
      <p className="small muted">
        {blueprint.status === "ACTIVE"
          ? "النموذج النشط للقراءة فقط. لتغييره أنشئ نموذجًا جديدًا من صفحة الاختبار ثم فعّله."
          : "نموذج مؤرشف، محفوظ لأن جلسات سابقة خُطّطت به."}
      </p>
      <p>{`عدد الأسئلة: ${blueprint.questionCount}`}</p>
      <ul className="list">
        {blueprint.domains.map((domain) => (
          <li key={domain.id} className="admin-row">
            <span className="admin-row__main">
              <strong>{domain.name}</strong>
              <span className="small muted">
                {domain.weight === null
                  ? `وزن التصنيف ${domain.taxonomyWeight}`
                  : `الوزن ${domain.weight} (وزن التصنيف ${domain.taxonomyWeight})`}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
