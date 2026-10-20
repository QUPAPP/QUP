"use client";

import {
  type Control,
  type FieldErrors,
  type UseFormRegister,
  useFieldArray,
} from "react-hook-form";
import { FORM_LIMITS, type QuestionForm } from "@/lib/question-form";

export type BlocksPath = "stem" | "explanation" | `options.${number}.content`;

/**
 * Content as a list of blocks: text, or a formula typed as LaTeX (shown as its
 * source until math rendering exists). Blocks can be added, removed and moved;
 * nothing here is HTML.
 */
export function BlocksField({
  control,
  register,
  name,
  label,
  errors,
}: {
  control: Control<QuestionForm>;
  register: UseFormRegister<QuestionForm>;
  name: BlocksPath;
  label: string;
  errors?: FieldErrors<QuestionForm>;
}) {
  const { fields, append, remove, move } = useFieldArray({ control, name });
  const full = fields.length >= FORM_LIMITS.blocks;
  const error = fieldError(errors, name);

  return (
    <fieldset className="blocks-field">
      <legend className="field__label">{label}</legend>
      {fields.length === 0 ? <p className="small muted">لا يوجد محتوى.</p> : null}
      <ol className="blocks-field__list">
        {fields.map((field, index) => {
          const isMath = field.type === "math";
          const inputId = `${field.id}-value`;
          return (
            <li key={field.id} className="block-row">
              <label className="small muted" htmlFor={inputId}>
                {isMath ? `معادلة ${index + 1} (LaTeX)` : `نص ${index + 1}`}
              </label>
              <input type="hidden" {...register(`${name}.${index}.type` as const)} />
              {isMath ? (
                <input
                  id={inputId}
                  className="field__input"
                  dir="ltr"
                  {...register(`${name}.${index}.value` as const)}
                />
              ) : (
                <textarea
                  id={inputId}
                  className="field__input"
                  rows={2}
                  {...register(`${name}.${index}.value` as const)}
                />
              )}
              <div className="row block-row__actions">
                <button
                  type="button"
                  className="btn btn--small btn--ghost"
                  disabled={index === 0}
                  onClick={() => move(index, index - 1)}
                  aria-label={`نقل المقطع ${index + 1} للأعلى`}
                >
                  أعلى
                </button>
                <button
                  type="button"
                  className="btn btn--small btn--ghost"
                  disabled={index === fields.length - 1}
                  onClick={() => move(index, index + 1)}
                  aria-label={`نقل المقطع ${index + 1} للأسفل`}
                >
                  أسفل
                </button>
                <button
                  type="button"
                  className="btn btn--small btn--ghost"
                  onClick={() => remove(index)}
                  aria-label={`حذف المقطع ${index + 1}`}
                >
                  حذف
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="row">
        <button
          type="button"
          className="btn btn--small btn--ghost"
          disabled={full}
          onClick={() => append({ type: "text", value: "" })}
        >
          + نص
        </button>
        <button
          type="button"
          className="btn btn--small btn--ghost"
          disabled={full}
          onClick={() => append({ type: "math", value: "" })}
        >
          + معادلة
        </button>
      </div>
      {error ? (
        <span className="field__error" role="alert">
          {error}
        </span>
      ) : null}
    </fieldset>
  );
}

/** The message RHF stored for an array field (its root, or the array itself). */
function fieldError(errors: FieldErrors<QuestionForm> | undefined, name: BlocksPath) {
  const node = name
    .split(".")
    .reduce<unknown>(
      (value, key) => (value as Record<string, unknown> | undefined)?.[key],
      errors,
    ) as { message?: string; root?: { message?: string } } | undefined;
  return node?.root?.message ?? node?.message;
}
