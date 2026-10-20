"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { isApiError } from "@/lib/api";
import {
  createQuestion,
  getTaxonomyOutline,
  listAuthoringTaxonomies,
  type QuestionVersion,
  updateDraft,
} from "@/lib/question-api";
import {
  DIFFICULTY_PRESETS,
  emptyQuestionForm,
  formFromVersion,
  QUESTION_TYPES,
  type QuestionForm,
  questionFormSchema,
  toDraftContentInput,
} from "@/lib/question-form";
import { ErrorNotice, Loading } from "../../status";
import { TextField } from "../../text-field";
import { useSingleFlight } from "../use-single-flight";
import { BlocksField } from "./blocks-field";
import { ContentErrorNotice } from "./content-error";
import { MappingsField } from "./mappings-field";
import { OptionsField } from "./options-field";
import { TaxonomyPicker } from "./taxonomy-picker";

type EditorProps = {
  userId: string;
  onSaved: (version: QuestionVersion) => void;
  /** Another request changed the version: the page refetches it. */
  onStale?: () => void;
  /** Unsaved edits exist: the page holds back actions that use the saved version. */
  onDirtyChange?: (dirty: boolean) => void;
} & ({ mode: "create" } | { mode: "edit"; version: QuestionVersion });

/**
 * Creates a question or edits a DRAFT version. Saving an unfinished draft is
 * allowed; what a version needs before review is checked by the API on submit.
 */
export function QuestionEditor(props: EditorProps) {
  const { userId, onSaved, onStale, onDirtyChange } = props;
  const form = useForm<QuestionForm>({
    resolver: zodResolver(questionFormSchema),
    defaultValues: props.mode === "edit" ? formFromVersion(props.version) : emptyQuestionForm(),
  });
  const { control, register, formState } = form;
  const errors = formState.errors;
  useEffect(() => onDirtyChange?.(formState.isDirty), [formState.isDirty, onDirtyChange]);

  const taxonomies = useQuery({
    queryKey: ["authoring-taxonomies", userId],
    queryFn: listAuthoringTaxonomies,
  });
  const taxonomyVersionId = useWatch({ control, name: "taxonomyVersionId" });
  const outline = useQuery({
    queryKey: ["taxonomy-outline", userId, taxonomyVersionId],
    queryFn: () => getTaxonomyOutline(taxonomyVersionId),
    enabled: taxonomyVersionId !== "",
  });
  const difficulty = useWatch({ control, name: "difficulty" });
  const [mappingsCleared, setMappingsCleared] = useState(false);

  // Mappings point at one version's nodes; they cannot follow a change of version.
  const changeVersion = (next: string) => {
    if (form.getValues("mappings").length > 0) {
      form.setValue("mappings", [], { shouldDirty: true });
      setMappingsCleared(true);
    }
    form.setValue("taxonomyVersionId", next, { shouldDirty: true, shouldValidate: true });
  };

  const send = useSingleFlight((values: QuestionForm) =>
    props.mode === "create"
      ? createQuestion({ content: toDraftContentInput(values) })
      : updateDraft(props.version.id, toDraftContentInput(values)),
  );
  const save = useMutation({
    mutationFn: send,
    onSuccess: (saved) => {
      form.reset(formFromVersion(saved));
      setMappingsCleared(false);
      onSaved(saved);
    },
    onError: (error) => {
      if (isApiError(error, "QUESTION_VERSION_CHANGED")) onStale?.();
      if (isApiError(error, "INVALID_QUESTION_TRANSITION")) onStale?.();
    },
  });

  const isPreset = DIFFICULTY_PRESETS.some((preset) => String(preset.value) === difficulty);

  return (
    <form
      className="question-editor stack stack--loose"
      noValidate
      onSubmit={form.handleSubmit((values) => save.mutate(values))}
    >
      {save.isError ? <ContentErrorNotice error={save.error} /> : null}

      <section className="stack" aria-labelledby="qe-setup">
        <h3 id="qe-setup">النوع والتصنيف</h3>
        <div className="field">
          <label className="field__label" htmlFor="qe-type">
            نوع السؤال
          </label>
          <select id="qe-type" className="field__input" {...register("questionType")}>
            {QUESTION_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>
        {taxonomies.isPending ? <Loading label="جارٍ تحميل الاختبارات…" /> : null}
        {taxonomies.isError ? <ErrorNotice error={taxonomies.error} /> : null}
        {taxonomies.data ? (
          <TaxonomyPicker
            exams={taxonomies.data.items}
            value={taxonomyVersionId}
            onChange={changeVersion}
            error={errors.taxonomyVersionId?.message}
          />
        ) : null}
        {mappingsCleared ? (
          <p className="notice" role="status">
            تغيّرت نسخة التصنيف، فأُزيل ربط المهارات السابق. اربط المهارات من النسخة الجديدة.
          </p>
        ) : null}
        {outline.isError ? <ErrorNotice error={outline.error} /> : null}
      </section>

      <section className="stack" aria-labelledby="qe-stem">
        <h3 id="qe-stem">السؤال</h3>
        <BlocksField
          control={control}
          register={register}
          name="stem"
          label="نص السؤال"
          errors={errors}
        />
      </section>

      <section className="stack" aria-labelledby="qe-options">
        <h3 id="qe-options">الخيارات</h3>
        <OptionsField control={control} register={register} errors={errors} />
      </section>

      <section className="stack" aria-labelledby="qe-explanation">
        <h3 id="qe-explanation">الشرح (اختياري)</h3>
        <BlocksField
          control={control}
          register={register}
          name="explanation"
          label="شرح الإجابة"
          errors={errors}
        />
      </section>

      <section className="stack" aria-labelledby="qe-mappings">
        <h3 id="qe-mappings">المهارات</h3>
        <MappingsField
          control={control}
          register={register}
          errors={errors}
          outline={outline.data}
        />
      </section>

      <section className="stack" aria-labelledby="qe-meta">
        <h3 id="qe-meta">الصعوبة والمصدر</h3>
        <div className="admin-form">
          <div className="field">
            <label className="field__label" htmlFor="qe-difficulty">
              الصعوبة
            </label>
            <select id="qe-difficulty" className="field__input" {...register("difficulty")}>
              {DIFFICULTY_PRESETS.map((preset) => (
                <option key={preset.value} value={String(preset.value)}>
                  {preset.label}
                </option>
              ))}
              {isPreset ? null : <option value={difficulty}>{`مخصص (${difficulty})`}</option>}
            </select>
          </div>
          <TextField
            idPrefix="qe"
            label="نوع المصدر (اختياري)"
            registration={register("sourceType")}
            error={errors.sourceType?.message}
          />
          <TextField
            idPrefix="qe"
            label="مرجع المصدر (اختياري)"
            registration={register("sourceReference")}
            error={errors.sourceReference?.message}
          />
        </div>
      </section>

      <div className="row">
        <button type="submit" className="btn" disabled={save.isPending}>
          {save.isPending ? "جارٍ الحفظ…" : props.mode === "create" ? "حفظ كمسودة" : "حفظ التغييرات"}
        </button>
        {save.isSuccess && !formState.isDirty ? (
          <span className="small muted" role="status">
            حُفظت المسودة.
          </span>
        ) : null}
      </div>
    </form>
  );
}
