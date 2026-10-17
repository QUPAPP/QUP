"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { checkout, getExamAccess, listPlans, type PlanOffer } from "@/lib/api";
import { formatPrice } from "@/lib/messages";
import { useCurrentUser } from "@/lib/session";
import { EmptyState } from "./empty-state";
import { Icon } from "./icon";
import { ErrorNotice, Loading } from "./status";

export function PlanOffers({ examId }: { examId: string }) {
  const { data: user } = useCurrentUser();
  const plans = useQuery({
    queryKey: ["plans", user?.id, examId],
    queryFn: () => listPlans(examId),
    enabled: !!user,
  });
  const access = useQuery({
    queryKey: ["exam-access", user?.id, examId],
    queryFn: () => getExamAccess(examId),
    enabled: !!user,
  });
  const keys = useRef(new Map<string, string>());
  const pay = useMutation({
    mutationFn: (plan: PlanOffer) => {
      const key = keys.current.get(plan.id) ?? crypto.randomUUID();
      keys.current.set(plan.id, key);
      return checkout(plan.id, key);
    },
    onSuccess: (payment) => {
      if (payment.checkoutUrl) window.location.assign(payment.checkoutUrl);
    },
  });
  if (plans.isPending || access.isPending) return <Loading label="جارٍ تحميل الباقات…" />;
  if (plans.isError || access.isError)
    return (
      <ErrorNotice error={plans.error ?? access.error}>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => {
            void plans.refetch();
            void access.refetch();
          }}
        >
          إعادة المحاولة
        </button>
      </ErrorNotice>
    );
  if (access.data.hasAccess)
    return (
      <div className="notice notice--success" role="status">
        <strong>اشتراكك في هذا الاختبار مفعّل.</strong>
        <p>
          يمكنك مراجعة جلساتك ونتائجك من مساحتك. التشخيص الكامل والتدريب سيُتاحان عند اكتمال
          تطويرهما.
        </p>
      </div>
    );
  if (plans.data.items.length === 0)
    return (
      <EmptyState
        title="الباقات غير متاحة حاليًا"
        description="يمكنك البدء بالتشخيص المصغّر المجاني. ستظهر باقات هذا الاختبار هنا فور إتاحتها."
        icon="credit"
      />
    );
  return (
    <div className="stack stack--loose">
      {pay.isError ? <ErrorNotice error={pay.error} /> : null}
      {pay.isSuccess && !pay.data.checkoutUrl ? (
        <p className="notice" role="status">
          لم يصل رابط دفع صالح. راجع حالة العملية أو أعد تحميل الصفحة قبل المحاولة مجددًا.
        </p>
      ) : null}
      <ul className="plan-grid">
        {plans.data.items.map((plan) => (
          <li key={plan.id} className="plan-card">
            <span className="item-symbol">
              <Icon name="credit" />
            </span>
            <h3>{plan.name}</h3>
            <p className="plan-price">{formatPrice(plan.price.amountMinor, plan.price.currency)}</p>
            <p className="plan-duration">
              {plan.durationDays === null ? "بدون مدة انتهاء" : `لمدة ${plan.durationDays} يومًا`}
            </p>
            <p className="small muted">باقة مستقلة لهذا الاختبار. يُفعّل الاشتراك بعد تأكيد الدفع.</p>
            <button
              type="button"
              className="btn"
              disabled={pay.isPending || pay.isSuccess}
              onClick={() => pay.mutate(plan)}
            >
              {pay.isPending || pay.isSuccess ? "جارٍ التحويل للدفع…" : "اشترك الآن"}
              <Icon name="arrow" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
