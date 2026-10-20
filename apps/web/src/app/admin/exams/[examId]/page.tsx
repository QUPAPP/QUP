"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AdminGate } from "@/components/admin/admin-gate";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { ExamEditFormView } from "@/components/admin/exam-form";
import { StatusBadge } from "@/components/admin/status-badge";
import { useSingleFlight } from "@/components/admin/use-single-flight";
import { VersionCreateFormView } from "@/components/admin/version-form";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { PageHeading } from "@/components/page-heading";
import { ErrorNotice, Loading } from "@/components/status";
import {
  type AdminExam,
  type ExamStatus,
  listAdminExams,
  listTaxonomyVersions,
  updateExam,
} from "@/lib/admin-api";
import { ADMIN_PERMISSIONS } from "@/lib/permissions";

export default function AdminExamPage() {
  const { examId } = useParams<{ examId: string }>();
  return (
    <AdminGate permission={ADMIN_PERMISSIONS.taxonomyManage}>
      {(me) => <ExamAdmin userId={me.user.id} examId={examId} />}
    </AdminGate>
  );
}

function ExamAdmin({ userId, examId }: { userId: string; examId: string }) {
  // The API has no single-exam admin route; exams number in the single digits (PRD §4).
  const exams = useQuery({ queryKey: ["admin-exams", userId], queryFn: listAdminExams });
  const exam = exams.data?.items.find((item) => item.id === examId);

  if (exams.isPending) {
    return (
      <main id="main-content" className="page">
        <Loading />
      </main>
    );
  }
  if (exams.isError) {
    return (
      <main id="main-content" className="page">
        <ErrorNotice error={exams.error}>
          <button type="button" className="btn btn--small" onClick={() => exams.refetch()}>
            إعادة المحاولة
          </button>
        </ErrorNotice>
      </main>
    );
  }
  if (!exam) {
    return (
      <main id="main-content" className="page">
        <EmptyState title="لم نجد هذا الاختبار" description="ربما أُدخل الرابط بشكل خاطئ.">
          <Link href="/admin/exams" className="btn btn--small">
            كل الاختبارات
          </Link>
        </EmptyState>
      </main>
    );
  }
  return <ExamDetails userId={userId} exam={exam} />;
}

const NEXT_STATUSES: Record<ExamStatus, { status: ExamStatus; label: string; note: string }[]> = {
  DRAFT: [
    {
      status: "ACTIVE",
      label: "تفعيل الاختبار",
      note: "سيظهر الاختبار للطلاب. لا يعود مسودة بعد التفعيل، ويلزم أن تكون له نسخة تصنيف منشورة.",
    },
    {
      status: "ARCHIVED",
      label: "أرشفة الاختبار",
      note: "الأرشفة نهائية: يختفي الاختبار من قائمة الطلاب ولا يمكن إعادته.",
    },
  ],
  ACTIVE: [
    {
      status: "ARCHIVED",
      label: "أرشفة الاختبار",
      note: "الأرشفة نهائية: يختفي الاختبار من قائمة الطلاب ولا يمكن إعادته.",
    },
  ],
  ARCHIVED: [],
};

function ExamDetails({ userId, exam }: { userId: string; exam: AdminExam }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const examsKey = ["admin-exams", userId];
  const versions = useQuery({
    queryKey: ["admin-versions", userId, exam.id],
    queryFn: () => listTaxonomyVersions(exam.id),
  });
  const changeStatus = useMutation({
    mutationFn: useSingleFlight((status: ExamStatus) => updateExam(exam.id, { status })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: examsKey }),
  });

  return (
    <main id="main-content" className="page stack stack--loose">
      <Link href="/admin/exams" className="text-link">
        كل الاختبارات <Icon name="arrow" />
      </Link>
      <PageHeading
        title={exam.nameAr}
        description={`الرمز ${exam.code} · الرابط ${exam.slug}`}
        action={<StatusBadge status={exam.status} />}
      />

      <section className="card stack" aria-labelledby="status-heading">
        <h2 id="status-heading">حالة الاختبار</h2>
        {changeStatus.isError ? <ErrorNotice error={changeStatus.error} /> : null}
        {NEXT_STATUSES[exam.status].length === 0 ? (
          <p className="muted">الاختبار مؤرشف ولا يمكن تغيير حالته.</p>
        ) : (
          <div className="stack">
            {NEXT_STATUSES[exam.status].map((next) => (
              <ConfirmAction
                key={next.status}
                label={next.label}
                description={next.note}
                danger={next.status === "ARCHIVED"}
                pending={changeStatus.isPending}
                onConfirm={() => changeStatus.mutate(next.status)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="card stack" aria-labelledby="versions-heading">
        <h2 id="versions-heading">نسخ التصنيف</h2>
        <p className="small muted">
          تُبنى الشجرة في نسخة مسودة ثم تُنشر. النسخة المنشورة للقراءة فقط، وأي تغيير بعدها يكون في
          نسخة جديدة.
        </p>
        {versions.isPending ? <Loading /> : null}
        {versions.isError ? <ErrorNotice error={versions.error} /> : null}
        {versions.data?.items.length === 0 ? (
          <p className="muted">لا توجد نسخ بعد. أنشئ أول نسخة مسودة من النموذج أدناه.</p>
        ) : null}
        {versions.data && versions.data.items.length > 0 ? (
          <ul className="list">
            {versions.data.items.map((version) => (
              <li key={version.id} className="admin-row">
                <Link href={`/admin/taxonomy-versions/${version.id}`} className="admin-row__main">
                  <strong dir="ltr">{version.versionCode}</strong>
                  <span className="small muted">
                    أُنشئت {new Date(version.createdAt).toLocaleDateString("ar-SA")}
                  </span>
                </Link>
                <StatusBadge status={version.status} />
                <Icon name="chevron" />
              </li>
            ))}
          </ul>
        ) : null}
        <h3>نسخة مسودة جديدة</h3>
        <VersionCreateFormView
          examId={exam.id}
          onCreated={async (version) => {
            await queryClient.invalidateQueries({ queryKey: ["admin-versions", userId, exam.id] });
            router.push(`/admin/taxonomy-versions/${version.id}`);
          }}
        />
      </section>

      <section className="card stack" aria-labelledby="details-heading">
        <h2 id="details-heading">بيانات الاختبار</h2>
        <ExamEditFormView
          exam={exam}
          onSaved={() => queryClient.invalidateQueries({ queryKey: examsKey })}
        />
      </section>
    </main>
  );
}
