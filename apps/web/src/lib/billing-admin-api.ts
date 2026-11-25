import { api, type Money, type Payment, type PaymentStatus } from "./api";

export type PlanStatus = "DRAFT" | "ACTIVE" | "RETIRED";
export type EntitlementSource = "PAYMENT" | "ADMIN" | "PROMO";
export type EntitlementStatus = "ACTIVE" | "EXPIRED" | "REVOKED";

export interface AdminPlan {
  id: string;
  /** The exams the plan unlocks: one, or several for a bundle. */
  examIds: string[];
  code: string;
  name: string;
  description: string | null;
  features: string[];
  highlighted: boolean;
  sortOrder: number;
  price: Money;
  compareAtPrice: Money | null;
  durationDays: number | null;
  status: PlanStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AdminEntitlement {
  id: string;
  examId: string;
  studentId: string;
  planId: string | null;
  source: EntitlementSource;
  status: EntitlementStatus;
  startsAt: string;
  endsAt: string | null;
}

export interface StudentLookup {
  student: { id: string; email: string | null; phone: string | null; displayName: string | null };
  entitlements: AdminEntitlement[];
}

export interface PlanContentInput {
  examIds: string[];
  name: string;
  description: string | null;
  features: string[];
  highlighted: boolean;
  sortOrder: number;
  priceMinor: number;
  compareAtPriceMinor: number | null;
  durationDays: number | null;
}

export interface CreatePlanInput extends PlanContentInput {
  code: string;
  currency: string;
}

/** On an offered plan the API refuses `examIds`; send only what may change. */
export type PlanChanges = Partial<PlanContentInput>;

export interface AdminPayment extends Payment {
  planName: string;
  student: StudentLookup["student"];
  provider: string;
  providerReference: string | null;
  providerPaymentId: string | null;
}

export interface RevenueSummary {
  since: string;
  succeeded: { count: number; amount: Money };
  refunded: { count: number; amount: Money };
  abandoned: number;
}

export const listAdminPlans = () => api<{ items: AdminPlan[] }>("/admin/plans");

export const createPlan = (body: CreatePlanInput) =>
  api<AdminPlan>("/admin/plans", { method: "POST", body });

export const updatePlan = (planId: string, body: PlanChanges) =>
  api<AdminPlan>(`/admin/plans/${planId}`, { method: "PATCH", body });

export const activatePlan = (planId: string) =>
  api<AdminPlan>(`/admin/plans/${planId}/activate`, { method: "POST" });

export const retirePlan = (planId: string) =>
  api<AdminPlan>(`/admin/plans/${planId}/retire`, { method: "POST" });

export const listAdminPayments = (query: { status?: PaymentStatus; cursor?: string }) => {
  const params = new URLSearchParams({ limit: "25" });
  if (query.status) params.set("status", query.status);
  if (query.cursor) params.set("cursor", query.cursor);
  return api<{ items: AdminPayment[]; next: string | null }>(`/admin/payments?${params}`);
};

export const getRevenueSummary = (days: 7 | 30) =>
  api<RevenueSummary>(`/admin/billing/summary?days=${days}`);

export const lookupStudent = (identifier: string) =>
  api<StudentLookup>(`/admin/students/lookup?identifier=${encodeURIComponent(identifier)}`);

export const grantEntitlement = (body: {
  studentId: string;
  examId: string;
  durationDays: number | null;
}) => api<AdminEntitlement>("/admin/entitlements", { method: "POST", body });

export const revokeEntitlement = (entitlementId: string) =>
  api<AdminEntitlement>(`/admin/entitlements/${entitlementId}/revoke`, { method: "POST" });

export const PLAN_STATUS_LABELS: Record<PlanStatus, string> = {
  DRAFT: "مسودة",
  ACTIVE: "معروضة للبيع",
  RETIRED: "متوقفة",
};

export const ENTITLEMENT_SOURCE_LABELS: Record<EntitlementSource, string> = {
  PAYMENT: "دفع إلكتروني",
  ADMIN: "منحة من الإدارة",
  PROMO: "رمز ترويجي",
};

export const ENTITLEMENT_STATUS_LABELS: Record<EntitlementStatus, string> = {
  ACTIVE: "فعّال",
  EXPIRED: "منتهٍ",
  REVOKED: "ملغى",
};

/** What a manual reconciliation led to (the API's webhook outcomes). */
export interface ReconcileResult {
  outcome: string;
  payment: { id: string; status: PaymentStatus };
}

/** Asks Stream about one of its payments and settles (or refunds) ours by it. Audited. */
export const reconcilePayment = (paymentId: string, providerPaymentId: string) =>
  api<ReconcileResult>(`/admin/payments/${paymentId}/reconcile`, {
    method: "POST",
    body: { providerPaymentId },
  });
