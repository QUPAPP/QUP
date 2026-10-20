"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { AdminGate } from "@/components/admin/admin-gate";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { ContentErrorNotice } from "@/components/admin/question-editor/content-error";
import { QuestionEditor } from "@/components/admin/question-editor/question-editor";
import { QuestionPreview } from "@/components/admin/question-preview";
import { ReviewPanel } from "@/components/admin/review-panel";
import { StatusBadge } from "@/components/admin/status-badge";
import { useSingleFlight } from "@/components/admin/use-single-flight";
import { Icon } from "@/components/icon";
import { PageHeading } from "@/components/page-heading";
import { ErrorNotice, Loading } from "@/components/status";
import { isApiError, type Me } from "@/lib/api";
import { ADMIN_PERMISSIONS, hasPermission } from "@/lib/permissions";
import {
  getQuestion,
  getQuestionVersion,
  getTaxonomyOutline,
  publishVersion,
  type QuestionVersion,
  submitForReview,
} from "@/lib/question-api";

const DECISION_LABEL = {
  APPROVED: "اعتُمدت",
  CHANGES_REQUESTED: "طُلبت تعديلات",
  REJECTED: "رُفضت",
} as const;

export default function QuestionVersionPage() {
  const { versionId } = useParams<{ versionId: string }>();
  return (
    <AdminGate permission={ADMIN_PERMISSIONS.questionsCreate}>
      {(me) => <VersionAdmin me={me} versionId={versionId} />}
    </AdminGate>
  );
}

function VersionAdmin({ me, versionId }: { me: Me; versionId: string }) {
  const userId = me.user.id;
  const queryClient = useQueryClient();
  const versionKey = ["admin-question-version", userId, versionId];
  const version = useQuery({ queryKey: versionKey, queryFn: () => getQuestionVersion(versionId) });

  if (version.isPending) {
    return (
      <main id="main-content" className="page">
        <Loading />
      </main>
    );
  }
  if (version.isError) {
    return (
      <main id="main-content" className="page">
        <ErrorNotice error={version.error}>
          <Link href="/admin/questions" className="btn btn--small">
            بنك الأسئلة
          </Link>
        </ErrorNotice>
      </main>
    );
  }

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: versionKey });
    void queryClient.invalidateQueries({
      queryKey: ["admin-question", userId, version.data.questionId],
    });
    void queryClient.invalidateQueries({ queryKey: ["admin-questions", userId] });
  };

  return <VersionDetails me={me} version={version.data} refresh={refresh} />;
}

function VersionDetails({
  me,
  version,
  refresh,
}: {
  me: Me;
  version: QuestionVersion;
  refresh: () => void;
}) {
  const userId = me.user.id;
  const question = useQuery({
    queryKey: ["admin-question", userId, version.questionId],
    queryFn: () => getQuestion(version.questionId),
  });
  const outline = useQuery({
    queryKey: ["taxonomy-outline", userId, version.taxonomyVersionId],
    queryFn: () => getTaxonomyOutline(version.taxonomyVersionId),
  });
  const [unsaved, setUnsaved] = useState(false);

  // Another person moved the version on: show what it is now.
  const refreshIfStale = (error: unknown) => {
    if (isApiError(error, "QUESTION_VERSION_CHANGED")) refresh();
    if (isApiError(error, "INVALID_QUESTION_TRANSITION")) refresh();
  };
  const sendSubmit = useSingleFlight(() => submitForReview(version.id));
  const sendPublish = useSingleFlight(() => publishVersion(version.id));
  const submit = useMutation({
    mutationFn: sendSubmit,
    onSuccess: refresh,
    onError: refreshIfStale,
  });
  const publish = useMutation({
    mutationFn: sendPublish,
    onSuccess: refresh,
    onError: refreshIfStale,
  });

  const archived = question.data?.archivedAt != null;
  const canReview = hasPermission(me, ADMIN_PERMISSIONS.questionsReview);
  const canPublish = hasPermission(me, ADMIN_PERMISSIONS.questionsPublish);
  const code = question.data?.stableCode;

  return (
    <main id="main-content" className="page stack stack--loose">
      <Link href={`/admin/questions/${version.questionId}`} className="text-link">
        {code ? `السؤال ${code}` : "صفحة السؤال"} <Icon name="arrow" />
      </Link>
      <PageHeading
        title={`النسخة ${version.versionNumber}${code ? ` من ${code}` : ""}`}
        description={`آخر تعديل ${new Date(version.updatedAt).toLocaleString("ar-SA")}`}
        action={<StatusBadge status={archived ? "ARCHIVED" : version.status} />}
      />

      {version.status === "DRAFT" && !archived ? (
        <>
          <section className="card stack" aria-labelledby="edit-heading">
            <h2 id="edit-heading">تعديل المسودة</h2>
            <QuestionEditor
              mode="edit"
              version={version}
              userId={userId}
              onSaved={refresh}
              onStale={refresh}
              onDirtyChange={setUnsaved}
            />
          </section>
          <section className="card stack" aria-labelledby="submit-heading">
            <h2 id="submit-heading">الإرسال للمراجعة</h2>
            <p className="small muted">
              بعد الإرسال يُقفل المحتوى حتى يراجعه أحد. إذا طُلبت تعديلات تعود مسودة.
            </p>
            {submit.isError ? <ContentErrorNotice error={submit.error} /> : null}
            {unsaved ? (
              <p className="notice" role="status">
                احفظ التغييرات أولًا؛ يُرسل للمراجعة ما حُفظ فقط.
              </p>
            ) : null}
            <button
              type="button"
              className="btn"
              disabled={unsaved || submit.isPending}
              onClick={() => submit.mutate(undefined)}
            >
              {submit.isPending ? "جارٍ الإرسال…" : "إرسال للمراجعة"}
            </button>
          </section>
        </>
      ) : null}

      <section className="card stack" aria-labelledby="preview-heading">
        <h2 id="preview-heading">{version.status === "DRAFT" ? "آخر نسخة محفوظة" : "السؤال"}</h2>
        <QuestionPreview version={version} outline={outline.data} />
      </section>

      {version.status === "UNDER_REVIEW" && !archived ? (
        <section className="card stack" aria-labelledby="review-heading">
          <h2 id="review-heading">المراجعة</h2>
          {canReview ? (
            <ReviewPanel versionId={version.id} onDone={refresh} onStale={refresh} />
          ) : (
            <p className="muted">النسخة بانتظار مراجعة من لديه صلاحية المراجعة.</p>
          )}
        </section>
      ) : null}

      {version.status === "APPROVED" && !archived ? (
        <section className="card stack" aria-labelledby="publish-heading">
          <h2 id="publish-heading">النشر</h2>
          {publish.isError ? <ContentErrorNotice error={publish.error} /> : null}
          {canPublish ? (
            <ConfirmAction
              label="نشر النسخة"
              description="تصبح هذه النسخة متاحة في الاختبارات والتدريب، وتُؤرشف النسخة المنشورة السابقة من السؤال إن وُجدت."
              confirmLabel="نعم، انشر النسخة"
              pending={publish.isPending}
              onConfirm={() => publish.mutate(undefined)}
            />
          ) : (
            <p className="muted">النسخة معتمدة وبانتظار النشر من الإدارة.</p>
          )}
        </section>
      ) : null}

      {version.status === "PUBLISHED" || version.status === "ARCHIVED" || archived ? (
        <p className="notice" role="status">
          هذه النسخة للقراءة فقط. لأي تعديل أنشئ نسخة جديدة من{" "}
          <Link href={`/admin/questions/${version.questionId}`}>صفحة السؤال</Link>.
        </p>
      ) : null}

      <section className="card stack" aria-labelledby="history-heading">
        <h2 id="history-heading">سجل المراجعات</h2>
        {version.reviews.length === 0 ? (
          <p className="small muted">لا توجد مراجعات لهذه النسخة بعد.</p>
        ) : (
          <ol className="list">
            {[...version.reviews].reverse().map((review) => (
              <li key={`${review.createdAt}-${review.decision}`} className="admin-row review-entry">
                <span className="admin-row__main">
                  <strong>{DECISION_LABEL[review.decision]}</strong>
                  <span className="small muted">
                    {new Date(review.createdAt).toLocaleString("ar-SA")}
                  </span>
                  {review.notes ? (
                    <span className="review-entry__notes">{review.notes}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
