"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useId, useState } from "react";
import { AdminGate } from "@/components/admin/admin-gate";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { PageHeading } from "@/components/page-heading";
import { ErrorNotice, Loading } from "@/components/status";
import { ADMIN_PERMISSIONS } from "@/lib/permissions";
import {
  listAuthoringTaxonomies,
  listQuestions,
  type QuestionVersionStatus,
} from "@/lib/question-api";
import { QUESTION_TYPES } from "@/lib/question-form";

const PAGE_SIZE = 20;

const STATUS_FILTERS: { value: QuestionVersionStatus | ""; label: string }[] = [
  { value: "", label: "كل الحالات" },
  { value: "DRAFT", label: "مسودة" },
  { value: "UNDER_REVIEW", label: "قيد المراجعة" },
  { value: "APPROVED", label: "معتمد" },
  { value: "PUBLISHED", label: "منشور" },
  { value: "ARCHIVED", label: "مؤرشف" },
];

const TYPE_LABEL = Object.fromEntries(QUESTION_TYPES.map((type) => [type.value, type.label]));

export default function AdminQuestionsPage() {
  return (
    <AdminGate permission={ADMIN_PERMISSIONS.questionsCreate}>
      {(me) => <QuestionBank userId={me.user.id} />}
    </AdminGate>
  );
}

function QuestionBank({ userId }: { userId: string }) {
  const id = useId();
  const [status, setStatus] = useState<QuestionVersionStatus | "">("");
  const [taxonomyVersionId, setTaxonomyVersionId] = useState("");
  const [offset, setOffset] = useState(0);

  const taxonomies = useQuery({
    queryKey: ["authoring-taxonomies", userId],
    queryFn: listAuthoringTaxonomies,
  });
  const questions = useQuery({
    queryKey: ["admin-questions", userId, status, taxonomyVersionId, offset],
    queryFn: () =>
      listQuestions({
        limit: PAGE_SIZE,
        offset,
        ...(status ? { status } : {}),
        ...(taxonomyVersionId ? { taxonomyVersionId } : {}),
      }),
    placeholderData: keepPreviousData,
  });
  const page = questions.data?.page;

  return (
    <main id="main-content" className="page stack stack--loose">
      <PageHeading
        title="بنك الأسئلة"
        description="اكتب السؤال، أرسله للمراجعة، ثم يُنشر بعد اعتماده. كل تعديل بعد النشر يكون في نسخة جديدة."
        action={
          <Link href="/admin/questions/new" className="btn">
            <Icon name="plus" /> سؤال جديد
          </Link>
        }
      />

      <section className="card stack" aria-labelledby={`${id}-heading`}>
        <h2 id={`${id}-heading`}>الأسئلة</h2>
        <div className="admin-form">
          <div className="field">
            <label className="field__label" htmlFor={`${id}-status`}>
              الحالة
            </label>
            <select
              id={`${id}-status`}
              className="field__input"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as QuestionVersionStatus | "");
                setOffset(0);
              }}
            >
              {STATUS_FILTERS.map((filter) => (
                <option key={filter.value} value={filter.value}>
                  {filter.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field__label" htmlFor={`${id}-taxonomy`}>
              نسخة التصنيف
            </label>
            <select
              id={`${id}-taxonomy`}
              className="field__input"
              value={taxonomyVersionId}
              onChange={(event) => {
                setTaxonomyVersionId(event.target.value);
                setOffset(0);
              }}
            >
              <option value="">كل التصنيفات</option>
              {taxonomies.data?.items.map((item) => (
                <optgroup key={item.exam.id} label={item.exam.nameAr}>
                  {item.versions.map((version) => (
                    <option key={version.id} value={version.id}>
                      {version.versionCode}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>

        {questions.isPending ? <Loading /> : null}
        {questions.isError ? (
          <ErrorNotice error={questions.error}>
            <button type="button" className="btn btn--small" onClick={() => questions.refetch()}>
              إعادة المحاولة
            </button>
          </ErrorNotice>
        ) : null}
        {questions.data?.items.length === 0 ? (
          <EmptyState
            title="لا توجد أسئلة هنا"
            description={
              status || taxonomyVersionId
                ? "لا توجد أسئلة تطابق هذا التصفية."
                : "ابدأ بإضافة أول سؤال إلى البنك."
            }
          />
        ) : null}
        {questions.data && questions.data.items.length > 0 ? (
          <ul className="list" aria-busy={questions.isFetching}>
            {questions.data.items.map((question) => (
              <li key={question.id} className="admin-row question-row">
                <Link
                  href={`/admin/question-versions/${question.latestVersion.id}`}
                  className="admin-row__main"
                >
                  <strong>{question.latestVersion.stemPreview || "(سؤال بلا نص بعد)"}</strong>
                  <span className="small muted">
                    <span dir="ltr">{question.stableCode}</span>
                    {` · ${TYPE_LABEL[question.latestVersion.questionType]} · النسخة ${question.latestVersion.versionNumber}`}
                  </span>
                </Link>
                <StatusBadge
                  status={question.archivedAt ? "ARCHIVED" : question.latestVersion.status}
                />
              </li>
            ))}
          </ul>
        ) : null}

        {page && page.total > PAGE_SIZE ? (
          <nav className="row" aria-label="صفحات الأسئلة">
            <button
              type="button"
              className="btn btn--small btn--ghost"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              السابق
            </button>
            <span className="small muted">
              {`${page.offset + 1}–${Math.min(page.offset + page.limit, page.total)} من ${page.total}`}
            </span>
            <button
              type="button"
              className="btn btn--small btn--ghost"
              disabled={offset + PAGE_SIZE >= page.total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              التالي
            </button>
          </nav>
        ) : null}
      </section>
    </main>
  );
}
