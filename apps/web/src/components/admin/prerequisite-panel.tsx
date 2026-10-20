"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  addPrerequisite,
  removePrerequisite,
  type SkillNode,
  type TaxonomyTree,
} from "@/lib/admin-api";
import {
  dropNulls,
  type PrerequisiteForm,
  type PrerequisiteFormInput,
  prerequisiteFormSchema,
} from "@/lib/admin-forms";
import { prerequisiteCandidates, skillNames } from "@/lib/taxonomy-view";
import { ErrorNotice } from "../status";
import { TextField } from "../text-field";
import { useTreeMutation } from "./tree-mutation";

/**
 * A skill's prerequisites: remove a link, or add one from the version's
 * other active skills. Whether a new link would close a cycle is the API's
 * call (PREREQUISITE_CYCLE), shown here in Arabic.
 */
export function PrerequisitePanel({
  tree,
  skill,
  idPrefix,
  onDone,
  onStale,
  onCancel,
}: {
  tree: TaxonomyTree;
  skill: SkillNode;
  idPrefix: string;
  onDone: () => void;
  onStale: () => void;
  onCancel: () => void;
}) {
  const names = skillNames(tree);
  const candidates = prerequisiteCandidates(tree, skill.id);
  const form = useForm<PrerequisiteFormInput, unknown, PrerequisiteForm>({
    resolver: zodResolver(prerequisiteFormSchema),
    defaultValues: { prerequisiteSkillId: "", importanceWeight: "" },
  });
  const add = useTreeMutation(
    ({ prerequisiteSkillId, ...rest }: PrerequisiteForm) =>
      addPrerequisite(skill.id, { prerequisiteSkillId, ...dropNulls(rest) }),
    {
      onDone: () => {
        form.reset();
        onDone();
      },
      onStale,
    },
  );
  const remove = useTreeMutation(
    (prerequisiteSkillId: string) => removePrerequisite(skill.id, prerequisiteSkillId),
    { onDone, onStale },
  );
  const selectId = `${idPrefix}-prerequisite`;
  const selectError = form.formState.errors.prerequisiteSkillId?.message;

  return (
    <div className="tree-panel stack">
      <h4>المتطلبات السابقة لـ«{skill.name}»</h4>
      {remove.isError ? <ErrorNotice error={remove.error} /> : null}
      {skill.prerequisites.length === 0 ? (
        <p className="small muted">لا توجد متطلبات سابقة لهذه المهارة.</p>
      ) : (
        <ul className="list">
          {skill.prerequisites.map((link) => (
            <li key={link.prerequisiteSkillId} className="admin-row">
              <span className="admin-row__main">
                {names.get(link.prerequisiteSkillId) ?? "مهارة غير معروفة"}
                <span className="small muted">الأهمية {link.importanceWeight}</span>
              </span>
              <button
                type="button"
                className="btn btn--small btn--ghost"
                disabled={remove.isPending}
                onClick={() => remove.mutate(link.prerequisiteSkillId)}
              >
                إزالة
              </button>
            </li>
          ))}
        </ul>
      )}

      {candidates.length === 0 ? (
        <p className="small muted">لا توجد مهارات أخرى نشطة يمكن إضافتها متطلبًا.</p>
      ) : (
        <form
          className="admin-form"
          noValidate
          onSubmit={form.handleSubmit((values) => add.mutate(values))}
        >
          {add.isError ? <ErrorNotice error={add.error} /> : null}
          <div className="field">
            <label className="field__label" htmlFor={selectId}>
              المهارة المطلوبة قبلها
            </label>
            <select
              id={selectId}
              className="field__input"
              aria-invalid={selectError ? true : undefined}
              aria-describedby={selectError ? `${selectId}-error` : undefined}
              {...form.register("prerequisiteSkillId")}
            >
              <option value="">اختر مهارة…</option>
              {candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
            {selectError ? (
              <span id={`${selectId}-error`} className="field__error" role="alert">
                {selectError}
              </span>
            ) : null}
          </div>
          <TextField
            idPrefix={idPrefix}
            label="الأهمية (اختياري)"
            hint="اتركه فارغًا للقيمة الافتراضية (1)"
            inputMode="decimal"
            registration={form.register("importanceWeight")}
            error={form.formState.errors.importanceWeight?.message}
            ltr
          />
          <div className="admin-form__actions row">
            <button type="submit" className="btn btn--small" disabled={add.isPending}>
              {add.isPending ? "جارٍ الإضافة…" : "إضافة المتطلب"}
            </button>
            <button type="button" className="btn btn--small btn--ghost" onClick={onCancel}>
              إغلاق
            </button>
          </div>
        </form>
      )}
      {candidates.length === 0 ? (
        <button type="button" className="btn btn--small btn--ghost" onClick={onCancel}>
          إغلاق
        </button>
      ) : null}
    </div>
  );
}
