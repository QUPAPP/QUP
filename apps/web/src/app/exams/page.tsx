"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

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
    <main className="page stack stack--loose">
      <div className="stack">
        <h1>اختر اختبارك</h1>
        <p className="muted">ابدأ بتشخيص مصغّر مجاني لكل اختبار لتعرف مستواك.</p>
      </div>

      {exams.isPending ? <Loading /> : null}
      {exams.isError ? <ErrorNotice error={exams.error} /> : null}
      {exams.data?.items.length === 0 ? (
        <p className="notice">لا توجد اختبارات متاحة حاليًا. ستظهر هنا فور إتاحتها.</p>
      ) : null}

      <ul className="stack">
        {exams.data?.items.map((exam) => (
          <li key={exam.id} className="card stack">
            <h2>{exam.nameAr}</h2>
            {exam.description ? <p className="muted">{exam.description}</p> : null}
            <div>
              <Link href={`/exams/${exam.id}/diagnostic`} className="btn">
                التشخيص المصغّر
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
