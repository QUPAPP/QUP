"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { PageHeading } from "@/components/page-heading";
import { ErrorNotice, Loading } from "@/components/status";
import { getDashboard, listExams } from "@/lib/api";
import { nextStepLink } from "@/lib/next-step";
import { useRequireUser } from "@/lib/session";

export default function ExamsPage() {
  const user = useRequireUser();
  const exams = useQuery({
    queryKey: ["exams"],
    queryFn: listExams,
    enabled: user !== null,
  });
  const dashboard = useQuery({
    queryKey: ["dashboard", user?.id],
    queryFn: getDashboard,
    enabled: user !== null,
  });
  const progressOf = (examId: string) =>
    dashboard.data?.exams.find((entry) => entry.exam.id === examId);

  return (
    <main id="main-content" className="page stack stack--loose">
      <PageHeading
        title="اختر اختبارك"
        description="التشخيص المصغّر مجاني لكل اختبار، ونتيجته المبدئية تظهر فور إكماله."
        action={
          <Link href="/dashboard" className="text-link">
            جلساتي السابقة <Icon name="chevron" />
          </Link>
        }
      />

      {exams.isPending ? <Loading /> : null}
      {exams.isError ? <ErrorNotice error={exams.error} /> : null}
      {exams.data?.items.length === 0 ? (
        <EmptyState
          title="اختباراتك القادمة تبدأ من هنا"
          description="لا توجد اختبارات متاحة حاليًا. ستظهر هنا فور إتاحتها."
        />
      ) : null}

      {exams.data?.items.length ? (
        <ul className="exam-list">
          {exams.data.items.map((exam) => {
            const progress = progressOf(exam.id);
            const next = progress
              ? nextStepLink(progress.nextStep, exam.id)
              : { href: `/exams/${exam.id}/diagnostic`, label: "ابدأ التشخيص المجاني" };
            const status = !progress
              ? "لم تبدأ بعد"
              : progress.hasAccess
                ? "مشترك في الباقة"
                : "أنهيت التشخيص المصغّر";
            return (
              <li key={exam.id} className="exam-row">
                <div className="exam-row__body">
                  <h2>{exam.nameAr}</h2>
                  {exam.description ? <p className="muted">{exam.description}</p> : null}
                  <p className="exam-row__status" data-paid={progress?.hasAccess || undefined}>
                    {status}
                  </p>
                </div>
                <div className="exam-row__actions">
                  <Link href={next.href} className="btn">
                    {next.label} <Icon name="arrow" />
                  </Link>
                  {progress?.hasAccess ? (
                    <Link href={`/exams/${exam.id}/profile`} className="text-link">
                      ملف مهاراتي <Icon name="chevron" />
                    </Link>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </main>
  );
}
