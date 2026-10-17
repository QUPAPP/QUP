"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { ErrorNotice, Loading } from "@/components/status";
import { getPayment } from "@/lib/api";
import { useRequireUser } from "@/lib/session";

const POLL_INTERVAL_MS = 3_000;
/** The provider's confirmation normally arrives within seconds; after this we stop asking. */
const MAX_WAIT_MS = 120_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function PaymentReturnPage() {
  return (
    <main id="main-content" className="page page--focused stack stack--loose">
      <h1>حالة الدفع</h1>
      {/* useSearchParams needs a Suspense boundary to be prerendered. */}
      <Suspense fallback={<Loading />}>
        <PaymentStatus />
      </Suspense>
      <p>
        <Link href="/exams">العودة إلى الاختبارات</Link>
      </p>
    </main>
  );
}

/**
 * Arriving on this page proves nothing about the payment: anyone can open the
 * URL. What is shown is the payment's status as the server reports it, which
 * only changes when the provider itself confirms the money.
 */
function PaymentStatus() {
  const paymentId = useSearchParams().get("payment") ?? "";
  const user = useRequireUser();
  const valid = UUID.test(paymentId);

  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setGaveUp(true), MAX_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);

  const payment = useQuery({
    queryKey: ["payment", paymentId],
    queryFn: () => getPayment(paymentId),
    enabled: valid && user !== null,
    refetchInterval: (query) =>
      query.state.data?.status === "PENDING" && !gaveUp ? POLL_INTERVAL_MS : false,
  });

  if (!valid) return <p className="notice notice--error">رابط الدفع غير صحيح.</p>;
  if (payment.isPending) return <Loading label="جارٍ التحقق من الدفع…" />;
  if (payment.isError) return <ErrorNotice error={payment.error} />;

  switch (payment.data.status) {
    case "SUCCEEDED":
      return (
        <p className="notice notice--success" role="status">
          تم الدفع بنجاح، وتم تفعيل اشتراكك.
        </p>
      );
    case "PENDING":
      return !gaveUp ? (
        <Loading label="بانتظار تأكيد الدفع من مزوّد الخدمة…" />
      ) : (
        <p className="notice" role="status">
          لم يصلنا تأكيد الدفع بعد. إذا أتممت الدفع فسيُفعَّل اشتراكك تلقائيًا خلال دقائق؛ حدّث الصفحة
          لاحقًا.
        </p>
      );
    case "REFUNDED":
      return (
        <p className="notice" role="status">
          تم استرجاع مبلغ هذه العملية.
        </p>
      );
    default:
      return (
        <p className="notice notice--error" role="status">
          لم تكتمل عملية الدفع، ولم يُخصم منك شيء. يمكنك المحاولة من جديد من صفحة النتيجة.
        </p>
      );
  }
}
