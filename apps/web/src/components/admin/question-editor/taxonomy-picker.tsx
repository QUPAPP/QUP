"use client";

import { useId, useState } from "react";
import type { AuthoringExam } from "@/lib/question-api";

const VERSION_STATUS: Record<"DRAFT" | "PUBLISHED", string> = {
  DRAFT: "مسودة",
  PUBLISHED: "منشورة",
};

/**
 * Exam, then one of its taxonomy versions. A question is published only
 * against a published version (the API checks); drafts may use either.
 */
export function TaxonomyPicker({
  exams,
  value,
  onChange,
  error,
}: {
  exams: AuthoringExam[];
  value: string;
  onChange: (taxonomyVersionId: string) => void;
  error?: string | undefined;
}) {
  const id = useId();
  const owner = exams.find((item) => item.versions.some((version) => version.id === value));
  const [examId, setExamId] = useState(owner?.exam.id ?? "");
  const versions = exams.find((item) => item.exam.id === examId)?.versions ?? [];

  return (
    <div className="admin-form">
      <div className="field">
        <label className="field__label" htmlFor={`${id}-exam`}>
          الاختبار
        </label>
        <select
          id={`${id}-exam`}
          className="field__input"
          value={examId}
          onChange={(event) => {
            setExamId(event.target.value);
            onChange("");
          }}
        >
          <option value="">اختر الاختبار…</option>
          {exams.map((item) => (
            <option key={item.exam.id} value={item.exam.id}>
              {item.exam.nameAr}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="field__label" htmlFor={`${id}-version`}>
          نسخة التصنيف
        </label>
        <select
          id={`${id}-version`}
          className="field__input"
          value={value}
          disabled={examId === ""}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-version-error` : undefined}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">اختر النسخة…</option>
          {versions.map((version) => (
            <option key={version.id} value={version.id}>
              {`${version.versionCode} (${VERSION_STATUS[version.status]})`}
            </option>
          ))}
        </select>
        {error ? (
          <span id={`${id}-version-error`} className="field__error" role="alert">
            {error}
          </span>
        ) : null}
      </div>
    </div>
  );
}
