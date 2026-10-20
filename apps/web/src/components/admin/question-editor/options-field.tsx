"use client";

import {
  type Control,
  type FieldErrors,
  type UseFormRegister,
  useFieldArray,
} from "react-hook-form";
import { FORM_LIMITS, optionKey, type QuestionForm } from "@/lib/question-form";
import { BlocksField } from "./blocks-field";

/**
 * The options and their answer key. "Correct" is a checkbox for every type:
 * how many may be correct is the API's rule (CORRECT_ANSWER_COUNT), shown on
 * submit — the editor does not decide it.
 */
export function OptionsField({
  control,
  register,
  errors,
}: {
  control: Control<QuestionForm>;
  register: UseFormRegister<QuestionForm>;
  errors: FieldErrors<QuestionForm>;
}) {
  const { fields, append, remove, move } = useFieldArray({ control, name: "options" });

  return (
    <fieldset className="stack">
      <legend className="field__label">الخيارات والإجابة الصحيحة</legend>
      {fields.length === 0 ? <p className="small muted">لا توجد خيارات بعد.</p> : null}
      <ol className="options-field">
        {fields.map((field, index) => {
          const keyId = `${field.id}-key`;
          const keyError = errors.options?.[index]?.key?.message;
          return (
            <li key={field.id} className="option-card stack">
              <div className="row">
                <div className="field option-card__key">
                  <label className="field__label" htmlFor={keyId}>
                    رمز الخيار {index + 1}
                  </label>
                  <input
                    id={keyId}
                    className="field__input"
                    dir="ltr"
                    aria-invalid={keyError ? true : undefined}
                    {...register(`options.${index}.key` as const)}
                  />
                  {keyError ? (
                    <span className="field__error" role="alert">
                      {keyError}
                    </span>
                  ) : null}
                </div>
                <label className="checkbox">
                  <input type="checkbox" {...register(`options.${index}.isCorrect` as const)} />
                  إجابة صحيحة
                </label>
              </div>
              <BlocksField
                control={control}
                register={register}
                name={`options.${index}.content`}
                label={`نص الخيار ${index + 1}`}
                errors={errors}
              />
              <div className="row">
                <button
                  type="button"
                  className="btn btn--small btn--ghost"
                  disabled={index === 0}
                  onClick={() => move(index, index - 1)}
                  aria-label={`نقل الخيار ${index + 1} للأعلى`}
                >
                  أعلى
                </button>
                <button
                  type="button"
                  className="btn btn--small btn--ghost"
                  disabled={index === fields.length - 1}
                  onClick={() => move(index, index + 1)}
                  aria-label={`نقل الخيار ${index + 1} للأسفل`}
                >
                  أسفل
                </button>
                <button
                  type="button"
                  className="btn btn--small btn--ghost"
                  onClick={() => remove(index)}
                  aria-label={`حذف الخيار ${index + 1}`}
                >
                  حذف الخيار
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        className="btn btn--small btn--ghost"
        disabled={fields.length >= FORM_LIMITS.options}
        onClick={() =>
          append({
            key: optionKey(fields.length),
            content: [{ type: "text", value: "" }],
            isCorrect: false,
          })
        }
      >
        + خيار
      </button>
      {errors.options?.root?.message || errors.options?.message ? (
        <span className="field__error" role="alert">
          {errors.options?.root?.message ?? errors.options?.message}
        </span>
      ) : null}
    </fieldset>
  );
}
