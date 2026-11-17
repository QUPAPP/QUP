"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { type ChangeEvent, type FormEvent, useId, useState } from "react";
import { AdminGate } from "@/components/admin/admin-gate";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { TaxonomyPicker } from "@/components/admin/question-editor/taxonomy-picker";
import { EmptyState } from "@/components/empty-state";
import { FilePicker } from "@/components/file-picker";
import { Icon } from "@/components/icon";
import { PageHeading } from "@/components/page-heading";
import { ErrorNotice, Loading } from "@/components/status";
import { formatDateTime } from "@/lib/format";
import {
  addKnowledge,
  archiveKnowledge,
  KNOWLEDGE_CONTENT_MAX,
  KNOWLEDGE_FILE_ACCEPT,
  KNOWLEDGE_KIND_HINTS,
  KNOWLEDGE_KIND_LABELS,
  KNOWLEDGE_TITLE_MAX,
  type KnowledgeItem,
  type KnowledgeKind,
  listKnowledge,
} from "@/lib/knowledge-api";
import { ADMIN_PERMISSIONS } from "@/lib/permissions";
import { getTaxonomyOutline, listAuthoringTaxonomies } from "@/lib/question-api";

const PAGE_SIZE = 20;
const KINDS: KnowledgeKind[] = ["EXAMPLE", "REFERENCE"];
/** Characters of an entry shown before "show all". */
const PREVIEW_CHARS = 280;

export default function KnowledgeLibraryPage() {
  return (
    <AdminGate permission={ADMIN_PERMISSIONS.aiManage}>
      {(me) => <Library userId={me.user.id} />}
    </AdminGate>
  );
}

/**
 * The AI knowledge library (AI_INTEGRATION.md "Knowledge Library"): admins
 * add model questions and references per exam. Generation follows the
 * models' style; the study chat answers from the references (RAG).
 */
function Library({ userId }: { userId: string }) {
  const [examId, setExamId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const taxonomies = useQuery({
    queryKey: ["authoring-taxonomies", userId],
    queryFn: listAuthoringTaxonomies,
  });
  const items = useQuery({
    queryKey: ["admin-knowledge", userId, examId, offset],
    queryFn: () => listKnowledge({ examId, limit: PAGE_SIZE, offset }),
    placeholderData: keepPreviousData,
  });
  const exams = taxonomies.data?.items ?? [];
  const examName = (id: string) => exams.find((item) => item.exam.id === id)?.exam.nameAr ?? "—";

  return (
    <main id="main-content" className="page stack stack--loose">
      <Link href="/admin/ai" className="text-link text-link--back">
        الذكاء الاصطناعي <Icon name="arrow" />
      </Link>
      <PageHeading
        title="مكتبة النماذج"
        description="ارفع نماذج الأسئلة والمراجع لكل اختبار. توليد الأسئلة يقلّد أسلوب النماذج، والمساعد الدراسي يجيب الطلاب مستندًا إلى المراجع. ما لا يوجد هنا لا يعرفه الذكاء الاصطناعي عن محتوى المنصة."
      />

      {taxonomies.isError ? <ErrorNotice error={taxonomies.error} /> : null}
      <AddEntryForm userId={userId} exams={taxonomies.data?.items ?? []} />

      <section className="card stack" aria-labelledby="knowledge-list-heading">
        <div className="row knowledge-list__head">
          <h2 id="knowledge-list-heading">ما في المكتبة</h2>
          <label className="visually-hidden" htmlFor="knowledge-exam-filter">
            الاختبار
          </label>
          <select
            id="knowledge-exam-filter"
            className="field__input knowledge-list__filter"
            value={examId ?? ""}
            onChange={(event) => {
              setExamId(event.target.value || null);
              setOffset(0);
            }}
          >
            <option value="">كل الاختبارات</option>
            {exams.map((item) => (
              <option key={item.exam.id} value={item.exam.id}>
                {item.exam.nameAr}
              </option>
            ))}
          </select>
        </div>
        {items.isPending ? <Loading /> : null}
        {items.isError ? <ErrorNotice error={items.error} /> : null}
        {items.data?.items.length === 0 ? (
          <EmptyState
            icon="book"
            title="المكتبة فارغة"
            description="أضف أول نموذج أسئلة ليتبع التوليد أسلوبه، أو مرجعًا يستند إليه المساعد الدراسي."
          />
        ) : null}
        {items.data && items.data.items.length > 0 ? (
          <ul className="list">
            {items.data.items.map((item) => (
              <KnowledgeRow
                key={item.id}
                item={item}
                examName={examName(item.examId)}
                userId={userId}
              />
            ))}
          </ul>
        ) : null}
        <nav className="pagination" aria-label="صفحات المكتبة">
          <button
            type="button"
            className="btn btn--ghost"
            disabled={offset === 0 || items.isFetching}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            الأحدث
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={!items.data?.page.hasMore || items.isFetching}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            الأقدم
          </button>
        </nav>
      </section>
    </main>
  );
}

function AddEntryForm({
  userId,
  exams,
}: {
  userId: string;
  exams: Parameters<typeof TaxonomyPicker>[0]["exams"];
}) {
  const id = useId();
  const queryClient = useQueryClient();
  const [taxonomyVersionId, setTaxonomyVersionId] = useState("");
  const [nodeId, setNodeId] = useState("");
  const [kind, setKind] = useState<KnowledgeKind>("EXAMPLE");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);

  const outline = useQuery({
    queryKey: ["taxonomy-outline", userId, taxonomyVersionId],
    queryFn: () => getTaxonomyOutline(taxonomyVersionId),
    enabled: taxonomyVersionId !== "",
  });
  const add = useMutation({
    mutationFn: () =>
      addKnowledge({
        taxonomyVersionId,
        nodeId: nodeId || null,
        kind,
        title: title.trim(),
        content: content.trim(),
      }),
    onSuccess: async () => {
      setTitle("");
      setContent("");
      await queryClient.invalidateQueries({ queryKey: ["admin-knowledge", userId] });
    },
  });

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const text = (await file.text()).trim();
    if (text.length > KNOWLEDGE_CONTENT_MAX) {
      setFileError(
        `الملف أطول من ${KNOWLEDGE_CONTENT_MAX.toLocaleString("ar")} حرف. قسّمه إلى أكثر من نموذج.`,
      );
      return;
    }
    setFileError(null);
    setContent(text);
    if (title.trim() === "")
      setTitle(file.name.replace(/\.[^.]+$/, "").slice(0, KNOWLEDGE_TITLE_MAX));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (ready && !add.isPending) add.mutate();
  }

  const skills = outline.data?.domains.flatMap((domain) => domain.skills) ?? [];
  const ready = taxonomyVersionId !== "" && title.trim() !== "" && content.trim() !== "";

  return (
    <form className="card stack" aria-labelledby={`${id}-heading`} onSubmit={submit}>
      <h2 id={`${id}-heading`}>إضافة إلى المكتبة</h2>
      <fieldset className="field">
        <legend className="field__label">النوع</legend>
        <div className="chip-group">
          {KINDS.map((value) => (
            <button
              key={value}
              type="button"
              className="chip"
              aria-pressed={kind === value}
              onClick={() => setKind(value)}
            >
              {KNOWLEDGE_KIND_LABELS[value]}
            </button>
          ))}
        </div>
        <p className="field__hint">{KNOWLEDGE_KIND_HINTS[kind]}</p>
      </fieldset>
      <TaxonomyPicker
        exams={exams}
        value={taxonomyVersionId}
        onChange={(next) => {
          setTaxonomyVersionId(next);
          setNodeId("");
        }}
      />
      <div className="admin-form">
        <div className="field">
          <label className="field__label" htmlFor={`${id}-skill`}>
            المهارة (اختياري)
          </label>
          <select
            id={`${id}-skill`}
            className="field__input"
            value={nodeId}
            disabled={taxonomyVersionId === "" || outline.isPending}
            onChange={(event) => setNodeId(event.target.value)}
          >
            <option value="">الاختبار كله</option>
            {skills.map((skill) => (
              <option key={skill.id} value={skill.id}>
                {skill.name}
              </option>
            ))}
          </select>
          <p className="field__hint">حين تختار مهارة، يُقدَّم هذا النموذج عند توليد أسئلتها.</p>
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`${id}-title`}>
            العنوان
          </label>
          <input
            id={`${id}-title`}
            className="field__input"
            maxLength={KNOWLEDGE_TITLE_MAX}
            placeholder="مثال: نموذج قدرات لفظي 1446"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
      </div>
      <div className="field">
        <label className="field__label" htmlFor={`${id}-content`}>
          النص
        </label>
        <textarea
          id={`${id}-content`}
          className="field__input knowledge-form__content"
          rows={10}
          maxLength={KNOWLEDGE_CONTENT_MAX}
          placeholder={
            "الصق الأسئلة هنا، وافصل بين كل سؤال والذي يليه بسطر فارغ.\n\nس١: ...\nأ) ...  ب) ...  ج) ...  د) ..."
          }
          value={content}
          onChange={(event) => setContent(event.target.value)}
        />
        <p className="field__hint">
          {`${content.length.toLocaleString("ar")} / ${KNOWLEDGE_CONTENT_MAX.toLocaleString("ar")} حرف. يُقسَّم النص إلى مقاطع يبحث فيها الذكاء الاصطناعي.`}
        </p>
      </div>
      <div className="field">
        <label className="field__label" htmlFor={`${id}-file`}>
          أو ارفع ملفًا نصيًا
        </label>
        <FilePicker id={`${id}-file`} accept={KNOWLEDGE_FILE_ACCEPT} onChange={readFile} />
        <p className="field__hint">
          ملفات txt أو md أو csv. لملف PDF أو Word انسخ نصه والصقه أعلاه.
        </p>
        {fileError ? (
          <p className="notice notice--error" role="alert">
            {fileError}
          </p>
        ) : null}
      </div>
      {add.isError ? <ErrorNotice error={add.error} /> : null}
      {add.isSuccess ? (
        <p className="notice" role="status">
          {`أُضيف «${add.data.item.title}» في ${add.data.item.chunkCount.toLocaleString("ar")} مقطع.`}
        </p>
      ) : null}
      <div className="row">
        <button type="submit" className="btn" disabled={!ready || add.isPending}>
          <Icon name="book" />
          {add.isPending ? "جارٍ الحفظ…" : "أضف إلى المكتبة"}
        </button>
      </div>
    </form>
  );
}

function KnowledgeRow({
  item,
  examName,
  userId,
}: {
  item: KnowledgeItem;
  examName: string;
  userId: string;
}) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const archive = useMutation({
    mutationFn: () => archiveKnowledge(item.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-knowledge", userId] }),
  });
  const long = item.content.length > PREVIEW_CHARS;

  return (
    <li className="knowledge-item stack">
      <div className="knowledge-item__head">
        <strong>{item.title}</strong>
        <span className={item.kind === "EXAMPLE" ? "badge badge--accent" : "badge"}>
          {KNOWLEDGE_KIND_LABELS[item.kind]}
        </span>
      </div>
      <span className="small muted">
        {`${examName} · ${item.skillId ? "مهارة محددة" : "الاختبار كله"} · ${item.chunkCount.toLocaleString("ar")} مقطع · ${formatDateTime(item.createdAt)}`}
      </span>
      <p className="knowledge-item__content">
        {expanded || !long ? item.content : `${item.content.slice(0, PREVIEW_CHARS)}…`}
      </p>
      <div className="row">
        {long ? (
          <button
            type="button"
            className="btn btn--ghost btn--small"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "اعرض أقل" : "اعرض النص كاملًا"}
          </button>
        ) : null}
        <ConfirmAction
          label="أرشفة"
          description={`لن يستخدم الذكاء الاصطناعي «${item.title}» بعد الآن. يبقى في سجل التدقيق.`}
          confirmLabel="أرشف"
          onConfirm={() => archive.mutate()}
          pending={archive.isPending}
          danger
        />
      </div>
      {archive.isError ? <ErrorNotice error={archive.error} /> : null}
    </li>
  );
}
