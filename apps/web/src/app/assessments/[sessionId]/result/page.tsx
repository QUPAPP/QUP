"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useRef } from "react";

import { ErrorNotice, Loading } from "@/components/status";
import {
  checkout,
  getResult,
  getSession,
  listPlans,
  type PlanOffer,
  type PreliminaryResult,
} from "@/lib/api";
import { formatPrice } from "@/lib/messages";
import { useRequireUser } from "@/lib/session";

export default function ResultPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const user = useRequireUser();
  const result = useQuery({
    queryKey: ["result", sessionId],
    queryFn: () => getResult(sessionId),
    enabled: user !== null,
  });
  const session = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => getSession(sessionId),
    enabled: user !== null,
  });

  return (
    <main className="page stack stack--loose">
      <h1>نتيجتك المبدئية</h1>
      {result.isPending ? <Loading label="جارٍ حساب نتيجتك…" /> : null}
      {result.isError ? <ErrorNotice error={result.error} /> : null}
      {result.data ? (
        <>
          <Summary result={result.data} />
          {result.data.nextStep ? (
            <Subscribe message={result.data.nextStep.message} examId={session.data?.examId} />
          ) : (
            <p className="notice notice--success">
              أنت مشترك في هذا الاختبار. التشخيص الكامل والتدريب قادمان قريبًا.
            </p>
          )}
        </>
      ) : null}
      <p>
        <Link href="/exams">العودة إلى الاختبارات</Link>
      </p>
    </main>
  );
}

/** Everything shown here was computed by the server; this only lays it out. */
function Summary({ result }: { result: PreliminaryResult }) {
  return (
    <section className="card stack stack--loose">
      <div className="score">
        <span className="score__value">{result.score.percentage}%</span>
        <span>
          {result.score.correct} / {result.score.total} إجابة صحيحة
        </span>
      </div>
      <p>
        المستوى التشخيصي: <span className="badge">{result.level.label}</span>
      </p>

      {result.strengths.length > 0 ? (
        <div className="stack">
          <h2>نقاط القوة</h2>
          <ul className="list">
            {result.strengths.map((entry) => (
              <li key={entry.skill} className="list__item list__item--strength">
                <span>{entry.skill}</span>
                <span>{entry.rating.label}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.weaknesses.length > 0 ? (
        <div className="stack">
          <h2>تحتاج إلى تدريب</h2>
          <ul className="list">
            {result.weaknesses.map((entry) => (
              <li key={entry.skill} className="list__item list__item--weakness">
                <span>{entry.skill}</span>
                <span>{entry.rating.label}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function Subscribe({ message, examId }: { message: string; examId: string | undefined }) {
  const plans = useQuery({
    queryKey: ["plans", examId],
    queryFn: () => listPlans(examId ?? ""),
    enabled: examId !== undefined,
  });
  // One key per plan for this visit: clicking twice cannot open two payments.
  const keys = useRef(new Map<string, string>());

  const pay = useMutation({
    mutationFn: (plan: PlanOffer) => {
      const key = keys.current.get(plan.id) ?? crypto.randomUUID();
      keys.current.set(plan.id, key);
      return checkout(plan.id, key);
    },
    onSuccess: (payment) => {
      // Payment happens on the provider's page; we come back to /payment/return.
      if (payment.checkoutUrl) window.location.assign(payment.checkoutUrl);
    },
  });

  return (
    <section className="card stack">
      <h2>التشخيص الكامل والتدريب</h2>
      <p>{message}</p>
      {plans.isPending && examId ? <Loading /> : null}
      {plans.isError ? <ErrorNotice error={plans.error} /> : null}
      {plans.data?.items.length === 0 ? (
        <p className="notice">باقات هذا الاختبار ستتوفر قريبًا.</p>
      ) : null}
      {pay.isError ? <ErrorNotice error={pay.error} /> : null}
      <ul className="list">
        {plans.data?.items.map((plan) => (
          <li key={plan.id} className="row justify-between">
            <div>
              <h3>{plan.name}</h3>
              <p className="small muted">
                {formatPrice(plan.price.amountMinor, plan.price.currency)}
                {plan.durationDays ? ` — لمدة ${plan.durationDays} يومًا` : " — بدون مدة انتهاء"}
              </p>
            </div>
            <button
              type="button"
              className="btn btn--gold"
              disabled={pay.isPending || pay.isSuccess}
              onClick={() => pay.mutate(plan)}
            >
              {pay.isPending || pay.isSuccess ? "جارٍ التحويل للدفع…" : "اشترك الآن"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
