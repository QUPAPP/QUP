"use client";

import { useMutation } from "@tanstack/react-query";
import { type ChangeEvent, useRef } from "react";
import {
  type Control,
  type FieldErrors,
  type UseFormRegister,
  useFieldArray,
  useWatch,
} from "react-hook-form";
import { ErrorNotice } from "@/components/status";
import { assetUrl } from "@/lib/api";
import { renderMath } from "@/lib/math";
import { readAsBase64, uploadQuestionAsset } from "@/lib/question-api";
import { FORM_LIMITS, type QuestionForm } from "@/lib/question-form";

export type BlocksPath = "stem" | "explanation" | `options.${number}.content`;

/** What the file pickers offer; the API still reads the real type from the bytes. */
const IMAGE_TYPES = "image/png,image/jpeg,image/webp";
const AUDIO_TYPES = "audio/mpeg,audio/mp4,audio/x-m4a,.mp3,.m4a";

const BLOCK_LABELS = {
  text: "نص",
  math: "معادلة (LaTeX)",
  image: "صورة",
  audio: "مقطع صوتي",
} as const;

/**
 * Content as a list of blocks: text, a formula typed as LaTeX (shown as its
 * source until math rendering exists), an image with its description, or — in
 * the stem only — a listening passage. Blocks can be added, removed and moved;
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
  const values = useWatch({ control, name });
  const full = fields.length >= FORM_LIMITS.blocks;
  const error = fieldError(errors, name);
  // A listening passage is part of the question, never of an option or the explanation.
  const allowAudio = name === "stem";
  const imageInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);

  const upload = useMutation({
    mutationFn: async (file: File) => uploadQuestionAsset(await readAsBase64(file)),
    onSuccess: (asset) =>
      append(
        asset.kind === "IMAGE"
          ? { type: "image", value: "", assetId: asset.id }
          : { type: "audio", value: "", assetId: asset.id },
      ),
  });

  function picked(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // The same file may be picked again after a failed upload.
    event.target.value = "";
    if (file) upload.mutate(file);
  }

  return (
    <fieldset className="blocks-field">
      <legend className="field__label">{label}</legend>
      {fields.length === 0 ? <p className="small muted">لا يوجد محتوى.</p> : null}
      <ol className="blocks-field__list">
        {fields.map((field, index) => {
          const type = field.type;
          const assetId = values?.[index]?.assetId ?? field.assetId;
          const inputId = `${field.id}-value`;
          return (
            <li key={field.id} className="block-row">
              <label className="small muted" htmlFor={type === "audio" ? undefined : inputId}>
                {`${BLOCK_LABELS[type]} ${index + 1}`}
              </label>
              <input type="hidden" {...register(`${name}.${index}.type` as const)} />
              <input type="hidden" {...register(`${name}.${index}.assetId` as const)} />
              {type === "math" ? (
                <div className="block-media">
                  <input
                    id={inputId}
                    className="field__input"
                    dir="ltr"
                    {...register(`${name}.${index}.value` as const)}
                  />
                  <MathPreview latex={values?.[index]?.value ?? ""} />
                </div>
              ) : type === "image" ? (
                <div className="block-media">
                  {assetId ? (
                    // biome-ignore lint/performance/noImgElement: next/image fetches server-side without the session cookie
                    <img className="content-image" src={assetUrl(assetId)} alt="" />
                  ) : null}
                  <input
                    id={inputId}
                    className="field__input"
                    placeholder="صف الصورة لمن لا يراها، دون كشف الإجابة"
                    {...register(`${name}.${index}.value` as const)}
                  />
                </div>
              ) : type === "audio" ? (
                assetId ? (
                  // biome-ignore lint/a11y/useMediaCaption: the author previews the listening passage
                  <audio
                    className="content-audio"
                    controls
                    preload="metadata"
                    src={assetUrl(assetId)}
                  />
                ) : null
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
      {upload.isError ? <ErrorNotice error={upload.error} /> : null}
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
        <button
          type="button"
          className="btn btn--small btn--ghost"
          disabled={full || upload.isPending}
          onClick={() => imageInput.current?.click()}
        >
          {upload.isPending ? "جارٍ الرفع…" : "+ صورة"}
        </button>
        {allowAudio ? (
          <button
            type="button"
            className="btn btn--small btn--ghost"
            disabled={full || upload.isPending}
            onClick={() => audioInput.current?.click()}
          >
            + مقطع صوتي
          </button>
        ) : null}
        <input
          ref={imageInput}
          type="file"
          accept={IMAGE_TYPES}
          hidden
          aria-hidden="true"
          tabIndex={-1}
          onChange={picked}
        />
        {allowAudio ? (
          <input
            ref={audioInput}
            type="file"
            accept={AUDIO_TYPES}
            hidden
            aria-hidden="true"
            tabIndex={-1}
            onChange={picked}
          />
        ) : null}
      </div>
      {error ? (
        <span className="field__error" role="alert">
          {error}
        </span>
      ) : null}
    </fieldset>
  );
}

/** How the formula will look to students, as the author types it. */
function MathPreview({ latex }: { latex: string }) {
  if (latex.trim() === "") return null;
  return (
    <span className="small muted">
      المعاينة:{" "}
      <span
        className="math"
        dir="ltr"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: KaTeX output from trust:false rendering (lib/math.ts)
        dangerouslySetInnerHTML={{ __html: renderMath(latex) }}
      />
    </span>
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
