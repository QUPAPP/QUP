"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AdminGate } from "@/components/admin/admin-gate";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { StatusBadge } from "@/components/admin/status-badge";
import { useSingleFlight } from "@/components/admin/use-single-flight";
import { Icon } from "@/components/icon";
import { PageHeading } from "@/components/page-heading";
import { ErrorNotice, Loading } from "@/components/status";
import type { Me } from "@/lib/api";
import { ADMIN_PERMISSIONS, hasPermission } from "@/lib/permissions";
import { archiveQuestion, createNextVersion, getQuestion } from "@/lib/question-api";

export default function AdminQuestionPage() {
  const { questionId } = useParams<{ questionId: string }>();
  return (
    <AdminGate permission={ADMIN_PERMISSIONS.questionsCreate}>
      {(me) => <QuestionDetails me={me} questionId={questionId} />}
    </AdminGate>
  );
}

function QuestionDetails({ me, questionId }: { me: Me; questionId: string }) {
  const userId = me.user.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const questionKey = ["admin-question", userId, questionId];
  const question = useQuery({ queryKey: questionKey, queryFn: () => getQuestion(questionId) });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: questionKey });
    void queryClient.invalidateQueries({ queryKey: ["admin-questions", userId] });
  };
  const sendNextVersion = useSingleFlight(() => createNextVersion(questionId));
  const sendArchive = useSingleFlight(() => archiveQuestion(questionId));
  const nextVersion = useMutation({
    mutationFn: sendNextVersion,
    onSuccess: (version) => {
      refresh();
      router.push(`/admin/question-versions/${version.id}`);
    },
  });
  const archive = useMutation({
    mutationFn: sendArchive,
    onSuccess: refresh,
  });

  if (question.isPending) {
    return (
      <main id="main-content" className="page">
        <Loading />
      </main>
    );
  }
  if (question.isError) {
    return (
      <main id="main-content" className="page">
        <ErrorNotice error={question.error}>
          <Link href="/admin/questions" className="btn btn--small">
            بنك الأسئلة
          </Link>
        </ErrorNotice>
      </main>
    );
  }

  const { data } = question;
  const archived = data.archivedAt !== null;

  return (
    <main id="main-content" className="page stack stack--loose">
      <Link href="/admin/questions" className="text-link">
        بنك الأسئلة <Icon name="arrow" />
      </Link>
      <PageHeading
        title={`السؤال ${data.stableCode}`}
        description={`${data.versions.length} نسخة`}
        action={archived ? <StatusBadge status="ARCHIVED" /> : undefined}
      />

      <section className="card stack" aria-labelledby="versions-heading">
        <h2 id="versions-heading">النسخ</h2>
        <ul className="list">
          {data.versions.map((version) => (
            <li key={version.id} className="admin-row">
              <Link href={`/admin/question-versions/${version.id}`} className="admin-row__main">
                <strong>{`النسخة ${version.versionNumber}`}</strong>
                <span className="small muted">
                  {`آخر تعديل ${new Date(version.updatedAt).toLocaleDateString("ar-SA")}`}
                </span>
              </Link>
              <StatusBadge status={version.status} />
            </li>
          ))}
        </ul>
        {nextVersion.isError ? <ErrorNotice error={nextVersion.error} /> : null}
        {archived ? null : (
          <div className="row">
            <button
              type="button"
              className="btn btn--small btn--ghost"
              disabled={nextVersion.isPending}
              onClick={() => nextVersion.mutate(undefined)}
            >
              {nextVersion.isPending ? "جارٍ الإنشاء…" : "إنشاء نسخة جديدة"}
            </button>
            <span className="small muted">تبدأ نسخة مسودة منسوخة من أحدث نسخة.</span>
          </div>
        )}
      </section>

      {!archived && hasPermission(me, ADMIN_PERMISSIONS.questionsPublish) ? (
        <section className="card stack" aria-labelledby="archive-heading">
          <h2 id="archive-heading">أرشفة السؤال</h2>
          {archive.isError ? <ErrorNotice error={archive.error} /> : null}
          <ConfirmAction
            label="أرشفة السؤال"
            description="تؤرشف كل نسخه، فيخرج من الاختبارات والتدريب. لا يُحذف شيء من السجل، ولا يمكن إعادة نشره."
            danger
            pending={archive.isPending}
            onConfirm={() => archive.mutate(undefined)}
          />
        </section>
      ) : null}
    </main>
  );
}
