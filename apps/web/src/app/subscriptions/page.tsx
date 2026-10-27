"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { PageHeading } from "@/components/page-heading";
import { PlanOffers } from "@/components/plan-offers";
import { ErrorNotice, Loading } from "@/components/status";
import { listExams } from "@/lib/api";
import { useCurrentUser, useRequireUser } from "@/lib/session";

export default function SubscriptionsPage() {
  const user = useRequireUser();
  const identity = useCurrentUser();
  const [selected, setSelected] = useState("");
  const exams = useQuery({
    queryKey: ["exams", user?.id],
    queryFn: listExams,
    enabled: user !== null,
  });
  const examId = selected || exams.data?.items[0]?.id;
  return (
    <main id="main-content" className="page stack stack--loose">
      <PageHeading
        title="الباقات"
        description="اختر اختبارك، وتعرّف على الباقات المتاحة له."
        action={
          <Link href="/exams" className="text-link">
            ابدأ بالتشخيص المجاني <Icon name="chevron" />
          </Link>
        }
      />
      <aside className="info-panel">
        <Icon name="credit" />
        <div>
          <h2>باقة لكل هدف</h2>
          <p>
            كل اختبار له اشتراك مستقل يشمل التشخيص الكامل، وملف المهارات، والتدريب، وإعادة القياس.
            السعر والمدة المعروضان هما تفاصيل الباقة الحالية.
          </p>
        </div>
      </aside>
      {identity.isError ? (
        <ErrorNotice error={identity.error} />
      ) : exams.isPending ? (
        <Loading />
      ) : null}
      {exams.isError ? (
        <ErrorNotice error={exams.error}>
          <button className="btn btn--ghost" type="button" onClick={() => exams.refetch()}>
            إعادة المحاولة
          </button>
        </ErrorNotice>
      ) : null}
      {exams.data?.items.length === 0 ? (
        <EmptyState
          title="لا توجد باقات معروضة بعد"
          description="ستظهر الاختبارات وباقاتها هنا عند إتاحتها."
          icon="credit"
        />
      ) : null}
      {user && exams.data && exams.data.items.length > 0 ? (
        <div className="field">
          <label htmlFor="plan-exam" className="field__label">
            الاختبار
          </label>
          <select
            id="plan-exam"
            className="field__input"
            value={examId}
            onChange={(event) => setSelected(event.target.value)}
          >
            {exams.data.items.map((exam) => (
              <option key={exam.id} value={exam.id}>
                {exam.nameAr}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {user && examId ? <PlanOffers key={examId} examId={examId} /> : null}
    </main>
  );
}
