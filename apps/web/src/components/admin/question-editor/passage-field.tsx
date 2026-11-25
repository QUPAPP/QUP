"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { QuestionPassage } from "@/components/question-passage";
import { ErrorNotice, Loading } from "@/components/status";
import { createPassage, getPassage, listPassages } from "@/lib/question-api";

/** Bounds of the API (questions.dto.ts); the API still checks. */
const TITLE_MAX = 200;
const TEXT_MAX = 5_000;

/**
 * The reading passage the question is about (استيعاب المقروء, STEP), shared by
 * several questions. Choose one already written, or write a new one. A passage
 * never changes once written — so a published question keeps showing what its
 * students read — and a correction is a new passage.
 */
export function PassageField({
  value,
  onChange,
}: {
  value: string;
  onChange: (passageId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [writing, setWriting] = useState(false);
  const selected = useQuery({
    queryKey: ["admin-passage", value],
    queryFn: () => getPassage(value),
    enabled: value !== "",
  });
  const found = useQuery({
    queryKey: ["admin-passages", search.trim()],
    queryFn: () => listPassages(search.trim()),
    enabled: value === "" && !writing,
  });

  if (value !== "") {
    return (
      <div className="stack">
        {selected.isPending ? <Loading /> : null}
        {selected.isError ? <ErrorNotice error={selected.error} /> : null}
        {selected.data ? (
          <>
            <p className="small">
              <strong>{selected.data.title}</strong>
            </p>
            <QuestionPassage passage={selected.data} />
          </>
        ) : null}
        <button type="button" className="btn btn--small btn--ghost" onClick={() => onChange("")}>
          إزالة القطعة من السؤال
        </button>
      </div>
    );
  }

  if (writing) {
    return (
      <NewPassage
        onCreated={(id) => {
          setWriting(false);
          onChange(id);
        }}
        onCancel={() => setWriting(false)}
      />
    );
  }

  return (
    <div className="stack">
      <p className="small muted">
        اختياري: لأسئلة استيعاب المقروء أو قراءة STEP، اربط السؤال بقطعة تظهر فوقه. القطعة الواحدة
        تُربط بعدة أسئلة.
      </p>
      <label className="field">
        <span className="field__label">ابحث في القطع بعنوانها</span>
        <input
          className="field__input"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      {found.isError ? <ErrorNotice error={found.error} /> : null}
      {found.data && found.data.items.length > 0 ? (
        <ul className="list">
          {found.data.items.map((passage) => (
            <li key={passage.id} className="admin-row">
              <span className="admin-row__main">
                <strong>{passage.title}</strong>
                <span className="small muted">{`مرتبطة بـ ${passage.questionCount} سؤال`}</span>
              </span>
              <button
                type="button"
                className="btn btn--small btn--ghost"
                onClick={() => onChange(passage.id)}
              >
                اختر
              </button>
            </li>
          ))}
        </ul>
      ) : found.data ? (
        <p className="small muted">لا توجد قطع بهذا العنوان.</p>
      ) : null}
      <button type="button" className="btn btn--small btn--ghost" onClick={() => setWriting(true)}>
        + قطعة جديدة
      </button>
    </div>
  );
}

function NewPassage({
  onCreated,
  onCancel,
}: {
  onCreated: (passageId: string) => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const textId = useId();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const create = useMutation({
    mutationFn: () =>
      createPassage({
        title: title.trim(),
        content: { blocks: [{ type: "text", text: text.trim() }] },
      }),
    onSuccess: (passage) => onCreated(passage.id),
  });
  const valid =
    title.trim().length > 0 &&
    title.trim().length <= TITLE_MAX &&
    text.trim().length > 0 &&
    text.trim().length <= TEXT_MAX;

  return (
    <div className="stack">
      {create.isError ? <ErrorNotice error={create.error} /> : null}
      <div className="field">
        <label className="field__label" htmlFor={titleId}>
          عنوان القطعة (للبحث عنها لاحقًا، لا يراه الطالب)
        </label>
        <input
          id={titleId}
          className="field__input"
          maxLength={TITLE_MAX}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <div className="field">
        <label className="field__label" htmlFor={textId}>
          نص القطعة
        </label>
        <textarea
          id={textId}
          className="field__input"
          rows={8}
          maxLength={TEXT_MAX}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <span className="field__hint">
          لا تُعدَّل القطعة بعد حفظها، حتى يبقى كل سؤال منشور يعرض ما قرأه طلابه. للتصحيح أنشئ قطعة
          جديدة.
        </span>
      </div>
      <div className="row">
        <button
          type="button"
          className="btn btn--small"
          disabled={!valid || create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending ? "جارٍ الحفظ…" : "احفظ القطعة واربطها"}
        </button>
        <button
          type="button"
          className="btn btn--small btn--ghost"
          disabled={create.isPending}
          onClick={onCancel}
        >
          إلغاء
        </button>
      </div>
    </div>
  );
}
