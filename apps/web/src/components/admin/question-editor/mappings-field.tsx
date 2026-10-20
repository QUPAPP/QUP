"use client";

import {
  type Control,
  type FieldErrors,
  type UseFormRegister,
  useFieldArray,
  useWatch,
} from "react-hook-form";
import type { TaxonomyOutline } from "@/lib/question-api";
import { FORM_LIMITS, type QuestionForm } from "@/lib/question-form";

/**
 * Which skills the question measures. Targets come from the chosen version's
 * active outline; whether exactly one is PRIMARY is the API's rule
 * (PRIMARY_MAPPING_COUNT), shown on submit.
 */
export function MappingsField({
  control,
  register,
  errors,
  outline,
}: {
  control: Control<QuestionForm>;
  register: UseFormRegister<QuestionForm>;
  errors: FieldErrors<QuestionForm>;
  outline: TaxonomyOutline | undefined;
}) {
  const { fields, append, remove } = useFieldArray({ control, name: "mappings" });
  const targets = useWatch({ control, name: "mappings" }) ?? [];
  const known = new Set(
    outline?.domains.flatMap((domain) =>
      domain.skills.flatMap((skill) => [
        `skill:${skill.id}`,
        ...skill.subskills.map((subskill) => `subskill:${subskill.id}`),
      ]),
    ),
  );

  return (
    <fieldset className="stack">
      <legend className="field__label">المهارات التي يقيسها السؤال</legend>
      {!outline ? <p className="small muted">اختر نسخة التصنيف أولًا لتظهر مهاراتها.</p> : null}
      {outline && fields.length === 0 ? (
        <p className="small muted">لم تُربط أي مهارة بعد. اربط مهارة أساسية واحدة على الأقل.</p>
      ) : null}
      <ol className="mappings-field">
        {fields.map((field, index) => {
          const target = targets[index]?.target ?? "";
          const targetId = `${field.id}-target`;
          const roleId = `${field.id}-role`;
          const weightId = `${field.id}-weight`;
          const rationaleId = `${field.id}-rationale`;
          const rowErrors = errors.mappings?.[index];
          return (
            <li key={field.id} className="mapping-row">
              <div className="field">
                <label className="field__label" htmlFor={targetId}>
                  المهارة
                </label>
                <select
                  id={targetId}
                  className="field__input"
                  aria-invalid={rowErrors?.target ? true : undefined}
                  {...register(`mappings.${index}.target` as const)}
                >
                  <option value="">اختر مهارة…</option>
                  {target && !known.has(target) ? (
                    <option value={target}>مهارة لم تعد نشطة في هذه النسخة</option>
                  ) : null}
                  {outline?.domains.map((domain) => (
                    <optgroup key={domain.id} label={domain.name}>
                      {domain.skills.map((skill) => [
                        <option key={skill.id} value={`skill:${skill.id}`}>
                          {skill.name}
                        </option>,
                        ...skill.subskills.map((subskill) => (
                          <option key={subskill.id} value={`subskill:${subskill.id}`}>
                            {`${skill.name} ← ${subskill.name}`}
                          </option>
                        )),
                      ])}
                    </optgroup>
                  ))}
                </select>
                {rowErrors?.target?.message ? (
                  <span className="field__error" role="alert">
                    {rowErrors.target.message}
                  </span>
                ) : null}
              </div>
              <div className="field">
                <label className="field__label" htmlFor={roleId}>
                  الدور
                </label>
                <select
                  id={roleId}
                  className="field__input"
                  {...register(`mappings.${index}.role` as const)}
                >
                  <option value="PRIMARY">أساسية</option>
                  <option value="SECONDARY">ثانوية</option>
                </select>
              </div>
              <div className="field">
                <label className="field__label" htmlFor={weightId}>
                  الوزن (اختياري)
                </label>
                <input
                  id={weightId}
                  className="field__input"
                  dir="ltr"
                  inputMode="decimal"
                  aria-invalid={rowErrors?.weight ? true : undefined}
                  {...register(`mappings.${index}.weight` as const)}
                />
                <span className="field__hint">فارغ = الوزن الافتراضي للدور</span>
                {rowErrors?.weight?.message ? (
                  <span className="field__error" role="alert">
                    {rowErrors.weight.message}
                  </span>
                ) : null}
              </div>
              <div className="field">
                <label className="field__label" htmlFor={rationaleId}>
                  السبب (اختياري)
                </label>
                <input
                  id={rationaleId}
                  className="field__input"
                  {...register(`mappings.${index}.rationale` as const)}
                />
              </div>
              <button
                type="button"
                className="btn btn--small btn--ghost"
                onClick={() => remove(index)}
                aria-label={`حذف ربط المهارة ${index + 1}`}
              >
                حذف
              </button>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        className="btn btn--small btn--ghost"
        disabled={!outline || fields.length >= FORM_LIMITS.mappings}
        onClick={() =>
          append({
            target: "",
            role: fields.length === 0 ? "PRIMARY" : "SECONDARY",
            weight: "",
            rationale: "",
          })
        }
      >
        + ربط مهارة
      </button>
    </fieldset>
  );
}
