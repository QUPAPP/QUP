// Rendered only inside the client billing page.
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { PAYMENT_STATUS_LABELS } from "@/components/payment-history";
import { ErrorNotice, Loading } from "@/components/status";
import type { PaymentStatus } from "@/lib/api";
import { type AdminPayment, getRevenueSummary, listAdminPayments } from "@/lib/billing-admin-api";
import { formatDateTime } from "@/lib/format";
import { formatPrice } from "@/lib/messages";
import { ReconcilePayment } from "./reconcile-payment";

const STATUSES = Object.keys(PAYMENT_STATUS_LABELS) as PaymentStatus[];

/** What came in over the last 7 or 30 days. */
export function RevenueSummaryCard({ userId }: { userId: string }) {
  const [days, setDays] = useState<7 | 30>(30);
  const summary = useQuery({
    queryKey: ["admin-revenue", userId, days],
    queryFn: () => getRevenueSummary(days),
  });

  return (
    <section className="card stack" aria-labelledby="revenue-heading">
      <div className="section-head">
        <h2 id="revenue-heading">المبيعات</h2>
        <fieldset className="segmented">
          <legend className="visually-hidden">الفترة</legend>
          {([7, 30] as const).map((window) => (
            <button
              key={window}
              type="button"
              className={`btn btn--small ${window === days ? "" : "btn--ghost"}`}
              aria-pressed={window === days}
              onClick={() => setDays(window)}
            >
              {window === 7 ? "آخر 7 أيام" : "آخر 30 يومًا"}
            </button>
          ))}
        </fieldset>
      </div>
      {summary.isPending ? <Loading /> : null}
      {summary.isError ? <ErrorNotice error={summary.error} /> : null}
      {summary.data ? (
        <dl className="stat-row">
          <div>
            <dt>الإيراد المحصّل</dt>
            <dd>
              {formatPrice(
                summary.data.succeeded.amount.amountMinor,
                summary.data.succeeded.amount.currency,
              )}
            </dd>
            <span className="small muted">{summary.data.succeeded.count} عملية ناجحة</span>
          </div>
          <div>
            <dt>المسترجع</dt>
            <dd>
              {formatPrice(
                summary.data.refunded.amount.amountMinor,
                summary.data.refunded.amount.currency,
              )}
            </dd>
            <span className="small muted">{summary.data.refunded.count} عملية</span>
          </div>
          <div>
            <dt>محاولات لم تكتمل</dt>
            <dd>{summary.data.abandoned}</dd>
            <span className="small muted">روابط دفع لم تُدفع</span>
          </div>
        </dl>
      ) : null}
    </section>
  );
}

/** Every payment, newest first; refunds are made in Stream's dashboard and arrive by webhook. */
export function PaymentsLedger({ userId }: { userId: string }) {
  const [status, setStatus] = useState<PaymentStatus | "">("");
  const pages = useInfiniteQuery({
    queryKey: ["admin-payments", userId, status],
    queryFn: ({ pageParam }) =>
      listAdminPayments({
        ...(status ? { status } : {}),
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: "",
    getNextPageParam: (last) => last.next ?? undefined,
  });
  const items = pages.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <section className="card stack" aria-labelledby="ledger-heading">
      <div className="section-head">
        <h2 id="ledger-heading">المدفوعات</h2>
        <label className="inline-field">
          <span className="small muted">الحالة</span>
          <select
            className="field__input"
            value={status}
            onChange={(event) => setStatus(event.target.value as PaymentStatus | "")}
          >
            <option value="">كل الحالات</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {PAYMENT_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="small muted">
        الاسترجاع يتم من لوحة Stream، ويصل إلى QUP تلقائيًا فيُلغى الاشتراك. طلب الاسترجاع في وقته إذا
        كان قبل الموعد الظاهر بجانب العملية.
      </p>
      {pages.isPending ? <Loading /> : null}
      {pages.isError ? <ErrorNotice error={pages.error} /> : null}
      {pages.data && items.length === 0 ? (
        <EmptyState title="لا توجد مدفوعات" description="ستظهر هنا كل عملية دفع فور فتحها." />
      ) : null}
      {items.length > 0 ? (
        <ul className="list">
          {items.map((payment) => (
            <LedgerRow key={payment.id} payment={payment} />
          ))}
        </ul>
      ) : null}
      {pages.hasNextPage ? (
        <button
          type="button"
          className="btn btn--ghost"
          disabled={pages.isFetchingNextPage}
          onClick={() => void pages.fetchNextPage()}
        >
          {pages.isFetchingNextPage ? "جارٍ التحميل…" : "عرض المزيد"}
        </button>
      ) : null}
    </section>
  );
}

function LedgerRow({ payment }: { payment: AdminPayment }) {
  const who = payment.student.displayName ?? payment.student.email ?? payment.student.phone ?? "—";
  const contact = [payment.student.email, payment.student.phone].filter(Boolean).join(" · ");
  const refundOpen =
    payment.refundableUntil !== null && Date.parse(payment.refundableUntil) > Date.now();
  return (
    <li className="admin-row admin-row--stacked">
      <div className="admin-row__line">
        <span className="admin-row__main">
          <strong>{payment.planName}</strong>
          <span className="small muted">
            {who}
            {contact && contact !== who ? (
              <>
                {" "}
                · <bdi dir="ltr">{contact}</bdi>
              </>
            ) : null}
          </span>
          <span className="small muted">
            {formatDateTime(payment.paidAt ?? payment.createdAt)}
            {payment.providerPaymentId ? (
              <>
                {" "}
                · Stream <bdi dir="ltr">{payment.providerPaymentId}</bdi>
              </>
            ) : null}
          </span>
          {refundOpen && payment.refundableUntil ? (
            <span className="small muted">
              مهلة الاسترجاع حتى {formatDateTime(payment.refundableUntil)}
            </span>
          ) : null}
        </span>
        <span className="plan-figure">
          {formatPrice(payment.amount.amountMinor, payment.amount.currency)}
        </span>
        <span className={`status-badge status-badge--${payment.status.toLowerCase()}`}>
          {PAYMENT_STATUS_LABELS[payment.status]}
        </span>
      </div>
      {/* A checkout that never settled may still have been paid at Stream. */}
      {payment.status === "PENDING" ||
      payment.status === "FAILED" ||
      payment.status === "CANCELLED" ? (
        <ReconcilePayment paymentId={payment.id} />
      ) : null}
    </li>
  );
}
