"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { PageHeading } from "@/components/page-heading";
import { ErrorNotice, Loading } from "@/components/status";
import { listExams } from "@/lib/api";
import { useRequireUser } from "@/lib/session";

export default function ExamsPage() {
  const user = useRequireUser();
  const exams = useQuery({
    queryKey: ["exams"],
    queryFn: listExams,
    enabled: user !== null,
  });

  return (
    <main id="main-content" className="page stack stack--loose">
      <PageHeading
        title="اختر اختبارك"
        description="لكل هدف نقطة بداية. اكتشف مستواك، ثم حدد خطوتك التالية."
        action={
          <Link href="/dashboard" className="text-link">
            جلساتي السابقة <Icon name="chevron" />
          </Link>
        }
      />
      <div className="info-panel">
        <Icon name="compass" />
        <div>
          <h2>ابدأ بمعرفة مستواك</h2>
          <p>
            التشخيص المصغّر مجاني لكل اختبار. بعد إكماله، تظهر لك نتيجة مبدئية وأبرز نقاط قوتك وما
            يحتاج إلى تدريب.
          </p>
        </div>
      </div>

      {exams.isPending ? <Loading /> : null}
      {exams.isError ? <ErrorNotice error={exams.error} /> : null}
      {exams.data?.items.length === 0 ? (
        <EmptyState
          title="اختباراتك القادمة تبدأ من هنا"
          description="لا توجد اختبارات متاحة حاليًا. ستظهر هنا فور إتاحتها."
        />
      ) : null}

      <ul className="exam-grid">
        {exams.data?.items.map((exam) => (
          <li key={exam.id} className="exam-card">
            <div className="exam-card-top">
              <span className="item-symbol">
                <Icon name="book" />
              </span>
            </div>
            <div className="exam-card-body">
              <h2>{exam.nameAr}</h2>
              {exam.description ? <p className="muted">{exam.description}</p> : null}
              <div className="exam-card-foot">
                <span>تشخيص مصغّر مجاني</span>
                <Link href={`/exams/${exam.id}/diagnostic`} className="btn">
                  ابدأ التشخيص <Icon name="arrow" />
                </Link>
              </div>
              <Link href={`/exams/${exam.id}/profile`} className="text-link">
                ملف مهاراتي <Icon name="chevron" />
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
