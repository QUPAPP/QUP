"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminGate } from "@/components/admin/admin-gate";
import { ExamCreateFormView } from "@/components/admin/exam-form";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { PageHeading } from "@/components/page-heading";
import { ErrorNotice, Loading } from "@/components/status";
import { listAdminExams } from "@/lib/admin-api";
import { ADMIN_PERMISSIONS } from "@/lib/permissions";

export default function AdminExamsPage() {
  return (
    <AdminGate permission={ADMIN_PERMISSIONS.taxonomyManage}>
      {(me) => <ExamsAdmin userId={me.user.id} />}
    </AdminGate>
  );
}

function ExamsAdmin({ userId }: { userId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const exams = useQuery({ queryKey: ["admin-exams", userId], queryFn: listAdminExams });

  return (
    <main id="main-content" className="page stack stack--loose">
      <PageHeading
        title="الاختبارات والتصنيف"
        description="أنشئ الاختبار، ثم ابنِ نسخة تصنيفه وانشرها قبل تفعيله للطلاب."
      />

      <section className="card stack" aria-labelledby="exams-heading">
        <h2 id="exams-heading">الاختبارات</h2>
        {exams.isPending ? <Loading /> : null}
        {exams.isError ? (
          <ErrorNotice error={exams.error}>
            <button type="button" className="btn btn--small" onClick={() => exams.refetch()}>
              إعادة المحاولة
            </button>
          </ErrorNotice>
        ) : null}
        {exams.data?.items.length === 0 ? (
          <EmptyState
            title="لا توجد اختبارات بعد"
            description="ابدأ بإنشاء أول اختبار من النموذج أدناه."
          />
        ) : null}
        {exams.data && exams.data.items.length > 0 ? (
          <ul className="list">
            {exams.data.items.map((exam) => (
              <li key={exam.id} className="admin-row">
                <Link href={`/admin/exams/${exam.id}`} className="admin-row__main">
                  <strong>{exam.nameAr}</strong>
                  <span className="small muted" dir="ltr">
                    {exam.code}
                  </span>
                </Link>
                <StatusBadge status={exam.status} />
                <Icon name="chevron" />
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="card stack" aria-labelledby="new-exam-heading">
        <h2 id="new-exam-heading">اختبار جديد</h2>
        <p className="small muted">يبدأ الاختبار مسودة لا يراها الطلاب حتى تفعّله.</p>
        <ExamCreateFormView
          onCreated={async (exam) => {
            await queryClient.invalidateQueries({ queryKey: ["admin-exams", userId] });
            router.push(`/admin/exams/${exam.id}`);
          }}
        />
      </section>
    </main>
  );
}
