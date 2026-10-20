"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  createDomain,
  createSkill,
  createSubskill,
  type DomainNode,
  type SkillNode,
  type SubskillNode,
  updateDomain,
  updateSkill,
  updateSubskill,
} from "@/lib/admin-api";
import {
  type DomainForm,
  type DomainFormInput,
  domainFormSchema,
  dropNulls,
  type SkillForm,
  type SkillFormInput,
  type SubskillForm,
  type SubskillFormInput,
  shareToPercent,
  skillFormSchema,
  subskillFormSchema,
} from "@/lib/admin-forms";
import { ErrorNotice } from "../status";
import { TextField } from "../text-field";
import { useTreeMutation } from "./tree-mutation";

/**
 * Create and edit forms for domains, skills and subskills — one component per
 * kind, so each has its own typed fields. On edit `code` is shown but never
 * sent: questions and imports refer to nodes by it.
 */

interface PanelProps {
  idPrefix: string;
  onDone: () => void;
  onStale: () => void;
  onCancel: () => void;
}

const asText = (value: number | null | undefined) =>
  value === null || value === undefined ? "" : String(value);

const percentText = (share: number | null) => (share === null ? "" : String(shareToPercent(share)));

const WEIGHT_HINT = "اتركه فارغًا للقيمة الافتراضية (1)";
const THRESHOLD_HINT = "نسبة مئوية، مثل 85. اتركه فارغًا لاستخدام القيمة الافتراضية للإصدار";

export function DomainFormView(
  props: PanelProps & ({ mode: "create"; versionId: string } | { mode: "edit"; node: DomainNode }),
) {
  const editing = props.mode === "edit" ? props.node : null;
  const form = useForm<DomainFormInput, unknown, DomainForm>({
    resolver: zodResolver(domainFormSchema),
    defaultValues: {
      code: editing?.code ?? "",
      name: editing?.name ?? "",
      description: editing?.description ?? "",
      weight: asText(editing?.weight),
      displayOrder: asText(editing?.displayOrder),
    },
  });
  const save = useTreeMutation(
    ({ code, ...changes }: DomainForm) =>
      props.mode === "edit"
        ? updateDomain(props.node.id, changes)
        : createDomain({ taxonomyVersionId: props.versionId, ...dropNulls({ code, ...changes }) }),
    props,
  );
  const errors = form.formState.errors;
  const field = { idPrefix: props.idPrefix };

  return (
    <form
      className="admin-form tree-panel"
      noValidate
      onSubmit={form.handleSubmit((values) => save.mutate(values))}
    >
      {save.isError ? <ErrorNotice error={save.error} /> : null}
      <TextField
        {...field}
        label="اسم المجال"
        registration={form.register("name")}
        error={errors.name?.message}
      />
      <CodeField
        {...field}
        existingCode={editing?.code ?? null}
        registration={form.register("code")}
        error={errors.code?.message}
      />
      <TextField
        {...field}
        label="الوزن"
        hint={WEIGHT_HINT}
        inputMode="decimal"
        registration={form.register("weight")}
        error={errors.weight?.message}
        ltr
      />
      <TextField
        {...field}
        label="ترتيب العرض"
        inputMode="numeric"
        registration={form.register("displayOrder")}
        error={errors.displayOrder?.message}
        ltr
      />
      <TextField
        {...field}
        label="الوصف (اختياري)"
        registration={form.register("description")}
        error={errors.description?.message}
      />
      <PanelActions pending={save.isPending} editing={editing !== null} onCancel={props.onCancel} />
    </form>
  );
}

export function SkillFormView(
  props: PanelProps & ({ mode: "create"; domainId: string } | { mode: "edit"; node: SkillNode }),
) {
  const editing = props.mode === "edit" ? props.node : null;
  const form = useForm<SkillFormInput, unknown, SkillForm>({
    resolver: zodResolver(skillFormSchema),
    defaultValues: {
      code: editing?.code ?? "",
      name: editing?.name ?? "",
      description: editing?.description ?? "",
      weight: asText(editing?.weight),
      masteryThresholdPercent: percentText(editing?.masteryThreshold ?? null),
      priorityWeight: asText(editing?.priorityWeight),
      minCoverage: asText(editing?.minCoverage),
      displayOrder: asText(editing?.displayOrder),
    },
  });
  const save = useTreeMutation(
    ({ code, ...changes }: SkillForm) =>
      props.mode === "edit"
        ? updateSkill(props.node.id, changes)
        : createSkill({ domainId: props.domainId, ...dropNulls({ code, ...changes }) }),
    props,
  );
  const errors = form.formState.errors;
  const field = { idPrefix: props.idPrefix };

  return (
    <form
      className="admin-form tree-panel"
      noValidate
      onSubmit={form.handleSubmit((values) => save.mutate(values))}
    >
      {save.isError ? <ErrorNotice error={save.error} /> : null}
      <TextField
        {...field}
        label="اسم المهارة"
        registration={form.register("name")}
        error={errors.name?.message}
      />
      <CodeField
        {...field}
        existingCode={editing?.code ?? null}
        registration={form.register("code")}
        error={errors.code?.message}
      />
      <TextField
        {...field}
        label="حد الإتقان ٪"
        hint={THRESHOLD_HINT}
        inputMode="decimal"
        registration={form.register("masteryThresholdPercent")}
        error={errors.masteryThresholdPercent?.message}
        ltr
      />
      <TextField
        {...field}
        label="الوزن"
        hint={WEIGHT_HINT}
        inputMode="decimal"
        registration={form.register("weight")}
        error={errors.weight?.message}
        ltr
      />
      <TextField
        {...field}
        label="وزن الأولوية"
        hint={WEIGHT_HINT}
        inputMode="decimal"
        registration={form.register("priorityWeight")}
        error={errors.priorityWeight?.message}
        ltr
      />
      <TextField
        {...field}
        label="أدنى تغطية (عدد أسئلة)"
        inputMode="numeric"
        registration={form.register("minCoverage")}
        error={errors.minCoverage?.message}
        ltr
      />
      <TextField
        {...field}
        label="ترتيب العرض"
        inputMode="numeric"
        registration={form.register("displayOrder")}
        error={errors.displayOrder?.message}
        ltr
      />
      <TextField
        {...field}
        label="الوصف (اختياري)"
        registration={form.register("description")}
        error={errors.description?.message}
      />
      <PanelActions pending={save.isPending} editing={editing !== null} onCancel={props.onCancel} />
    </form>
  );
}

export function SubskillFormView(
  props: PanelProps & ({ mode: "create"; skillId: string } | { mode: "edit"; node: SubskillNode }),
) {
  const editing = props.mode === "edit" ? props.node : null;
  const form = useForm<SubskillFormInput, unknown, SubskillForm>({
    resolver: zodResolver(subskillFormSchema),
    defaultValues: {
      code: editing?.code ?? "",
      name: editing?.name ?? "",
      description: editing?.description ?? "",
      weight: asText(editing?.weight),
      masteryThresholdPercent: percentText(editing?.masteryThreshold ?? null),
      displayOrder: asText(editing?.displayOrder),
    },
  });
  const save = useTreeMutation(
    ({ code, ...changes }: SubskillForm) =>
      props.mode === "edit"
        ? updateSubskill(props.node.id, changes)
        : createSubskill({ skillId: props.skillId, ...dropNulls({ code, ...changes }) }),
    props,
  );
  const errors = form.formState.errors;
  const field = { idPrefix: props.idPrefix };

  return (
    <form
      className="admin-form tree-panel"
      noValidate
      onSubmit={form.handleSubmit((values) => save.mutate(values))}
    >
      {save.isError ? <ErrorNotice error={save.error} /> : null}
      <TextField
        {...field}
        label="اسم المهارة الفرعية"
        registration={form.register("name")}
        error={errors.name?.message}
      />
      <CodeField
        {...field}
        existingCode={editing?.code ?? null}
        registration={form.register("code")}
        error={errors.code?.message}
      />
      <TextField
        {...field}
        label="حد الإتقان ٪"
        hint={THRESHOLD_HINT}
        inputMode="decimal"
        registration={form.register("masteryThresholdPercent")}
        error={errors.masteryThresholdPercent?.message}
        ltr
      />
      <TextField
        {...field}
        label="الوزن"
        hint={WEIGHT_HINT}
        inputMode="decimal"
        registration={form.register("weight")}
        error={errors.weight?.message}
        ltr
      />
      <TextField
        {...field}
        label="ترتيب العرض"
        inputMode="numeric"
        registration={form.register("displayOrder")}
        error={errors.displayOrder?.message}
        ltr
      />
      <TextField
        {...field}
        label="الوصف (اختياري)"
        registration={form.register("description")}
        error={errors.description?.message}
      />
      <PanelActions pending={save.isPending} editing={editing !== null} onCancel={props.onCancel} />
    </form>
  );
}

/** The code is typed once, on create; on edit it is shown and never sent. */
function CodeField({
  existingCode,
  ...props
}: { existingCode: string | null } & Omit<
  Parameters<typeof TextField>[0],
  "label" | "hint" | "ltr"
>) {
  if (existingCode !== null) {
    return (
      <div className="field">
        <span className="field__label">الرمز</span>
        <span className="field__static" dir="ltr">
          {existingCode}
        </span>
        <span className="field__hint">ثابت لا يتغير: الأسئلة تشير إليه.</span>
      </div>
    );
  }
  return (
    <TextField
      {...props}
      label="الرمز"
      hint="بحروف إنجليزية كبيرة، مثل ANALOGY. لا يتغير بعد الإنشاء"
      ltr
    />
  );
}

/** Disabled while saving, so a double click cannot submit twice. */
function PanelActions({
  pending,
  editing,
  onCancel,
}: {
  pending: boolean;
  editing: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="admin-form__actions row">
      <button type="submit" className="btn btn--small" disabled={pending}>
        {pending ? "جارٍ الحفظ…" : editing ? "حفظ" : "إضافة"}
      </button>
      <button
        type="button"
        className="btn btn--small btn--ghost"
        disabled={pending}
        onClick={onCancel}
      >
        إلغاء
      </button>
    </div>
  );
}
