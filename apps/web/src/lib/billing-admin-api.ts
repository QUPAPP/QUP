import { api } from "./api";

export type PlanStatus = "DRAFT" | "ACTIVE" | "RETIRED";
export type EntitlementSource = "PAYMENT" | "ADMIN" | "PROMO";
export type EntitlementStatus = "ACTIVE" | "EXPIRED" | "REVOKED";

export interface AdminPlan {
  id: string;
  examId: string;
  code: string;
  name: string;
  price: { amountMinor: number; currency: string };
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

export interface CreatePlanInput {
  examId: string;
  code: string;
  name: string;
  priceMinor: number;
  currency: string;
  durationDays: number | null;
}

export type PlanChanges = Partial<Pick<CreatePlanInput, "name" | "priceMinor" | "durationDays">>;

export const listAdminPlans = () => api<{ items: AdminPlan[] }>("/admin/plans");

export const createPlan = (body: CreatePlanInput) =>
  api<AdminPlan>("/admin/plans", { method: "POST", body });

export const updatePlan = (planId: string, body: PlanChanges) =>
  api<AdminPlan>(`/admin/plans/${planId}`, { method: "PATCH", body });

export const activatePlan = (planId: string) =>
  api<AdminPlan>(`/admin/plans/${planId}/activate`, { method: "POST" });

export const retirePlan = (planId: string) =>
  api<AdminPlan>(`/admin/plans/${planId}/retire`, { method: "POST" });

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
