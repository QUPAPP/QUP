import type { AccessStatus } from "../application/entitlements.service.js";
import type { Entitlement, Payment, Plan } from "../domain/ports.js";

const iso = (date: Date | null) => date?.toISOString() ?? null;

const price = (amountMinor: number, currency: string) => ({ amountMinor, currency });

/** A plan as a student sees it for sale. */
export function toPlanOfferView(plan: Plan) {
  return {
    id: plan.id,
    examId: plan.examId,
    name: plan.name,
    price: price(plan.priceMinor, plan.currency),
    durationDays: plan.durationDays,
  };
}

export function toAdminPlanView(plan: Plan) {
  return {
    ...toPlanOfferView(plan),
    code: plan.code,
    status: plan.status,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}

export function toAccessView(examId: string, access: AccessStatus) {
  return { examId, hasAccess: access.hasAccess, activeUntil: iso(access.activeUntil) };
}

export function toEntitlementView(entitlement: Entitlement) {
  return {
    id: entitlement.id,
    examId: entitlement.examId,
    source: entitlement.source,
    status: entitlement.status,
    startsAt: entitlement.startsAt.toISOString(),
    endsAt: iso(entitlement.endsAt),
  };
}

export function toAdminEntitlementView(entitlement: Entitlement) {
  return {
    ...toEntitlementView(entitlement),
    studentId: entitlement.studentId,
    planId: entitlement.planId,
  };
}

/**
 * A payment as its owner sees it. The checkout link is only offered while the
 * payment can still be paid; provider references stay server-side.
 */
export function toPaymentView(payment: Payment) {
  const payable = payment.status === "PENDING";
  return {
    id: payment.id,
    planId: payment.planId,
    status: payment.status,
    amount: price(payment.amountMinor, payment.currency),
    checkoutUrl: payable ? payment.checkoutUrl : null,
    checkoutExpiresAt: payable ? iso(payment.checkoutExpiresAt) : null,
    paidAt: iso(payment.paidAt),
    createdAt: payment.createdAt.toISOString(),
  };
}
