"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AdminGate } from "@/components/admin/admin-gate";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { StatusBadge } from "@/components/admin/status-badge";
import { TaxonomyTreeView } from "@/components/admin/taxonomy-tree";
import { useTreeMutation } from "@/components/admin/tree-mutation";
import { Icon } from "@/components/icon";
import { PageHeading } from "@/components/page-heading";
import { ErrorNotice, Loading } from "@/components/status";
import { getTaxonomyTree, listAdminExams, publishTaxonomyVersion } from "@/lib/admin-api";
import { ADMIN_PERMISSIONS } from "@/lib/permissions";

export default function TaxonomyVersionPage() {
  const { versionId } = useParams<{ versionId: string }>();
  return (
    <AdminGate permission={ADMIN_PERMISSIONS.taxonomyManage}>
      {(me) => <VersionAdmin userId={me.user.id} versionId={versionId} />}
    </AdminGate>
  );
}

function VersionAdmin({ userId, versionId }: { userId: string; versionId: string }) {
  const queryClient = useQueryClient();
  const treeKey = ["admin-tree", userId, versionId];
  const tree = useQuery({ queryKey: treeKey, queryFn: () => getTaxonomyTree(versionId) });
  const exams = useQuery({ queryKey: ["admin-exams", userId], queryFn: listAdminExams });
  const examId = tree.data?.version.examId;
  const exam = exams.data?.items.find((item) => item.id === examId);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: treeKey });
    if (examId) {
      void queryClient.invalidateQueries({ queryKey: ["admin-versions", userId, examId] });
    }
  };
  const publish = useTreeMutation(() => publishTaxonomyVersion(versionId), {
    onDone: invalidate,
    onStale: invalidate,
  });
  // A change to the tree answers an earlier "cannot publish yet".
  const refresh = () => {
    publish.reset();
    invalidate();
  };

  if (tree.isPending) {
    return (
      <main id="main-content" className="page">
        <Loading />
      </main>
    );
  }
  if (tree.isError) {
    return (
      <main id="main-content" className="page">
        <ErrorNotice error={tree.error}>
          <button type="button" className="btn btn--small" onClick={() => tree.refetch()}>
            إعادة المحاولة
          </button>
        </ErrorNotice>
      </main>
    );
  }

  const { version } = tree.data;
  const editable = version.status === "DRAFT";

  return (
    <main id="main-content" className="page stack stack--loose">
      {examId ? (
        <Link href={`/admin/exams/${examId}`} className="text-link">
          {exam ? exam.nameAr : "صفحة الاختبار"} <Icon name="arrow" />
        </Link>
      ) : null}
      <PageHeading
        title={exam ? `تصنيف ${exam.nameAr}` : "شجرة التصنيف"}
        description={`النسخة ${version.versionCode}`}
        action={<StatusBadge status={version.status} />}
      />

      {editable ? (
        <section className="card stack" aria-labelledby="publish-heading">
          <h2 id="publish-heading">نسخة مسودة</h2>
          <p className="small muted">
            عدّل الشجرة كما تحتاج، ثم انشرها. يلزم للنشر مجال نشط واحد على الأقل، وفي كل مجال مهارة
            نشطة.
          </p>
          {publish.isError ? <ErrorNotice error={publish.error} /> : null}
          <ConfirmAction
            label="نشر النسخة"
            description="بعد النشر تصبح هذه النسخة للقراءة فقط، وتُؤرشف النسخة المنشورة الحالية لهذا الاختبار إن وُجدت."
            confirmLabel="نعم، انشر النسخة"
            pending={publish.isPending}
            onConfirm={() => publish.mutate(undefined)}
          />
        </section>
      ) : (
        <p className="notice" role="status">
          هذه النسخة {version.status === "PUBLISHED" ? "منشورة" : "مؤرشفة"} وللقراءة فقط. لإجراء
          تغييرات أنشئ نسخة جديدة من صفحة الاختبار.
        </p>
      )}

      <section className="card stack" aria-labelledby="tree-heading">
        <h2 id="tree-heading">الشجرة</h2>
        <TaxonomyTreeView
          tree={tree.data}
          editable={editable}
          onChanged={refresh}
          onStale={refresh}
        />
      </section>
    </main>
  );
}
