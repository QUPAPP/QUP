import { api } from "./api";

export type RoleCode = "STUDENT" | "CONTENT_MANAGER" | "ADMIN";
export type UserStatus = "PENDING_VERIFICATION" | "ACTIVE" | "SUSPENDED" | "DEACTIVATED";

export interface AdminUser {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
  status: UserStatus;
  roles: RoleCode[];
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AdminRole {
  code: RoleCode;
  name: string;
  description: string | null;
  permissions: string[];
}

export interface UserListFilter {
  search?: string;
  role?: RoleCode | null;
  limit: number;
  offset: number;
}

/** Ordered from least to most access; the screen shows them in this order. */
export const ROLE_ORDER: readonly RoleCode[] = ["STUDENT", "CONTENT_MANAGER", "ADMIN"];

export const ROLE_LABELS: Record<RoleCode, string> = {
  STUDENT: "طالب",
  CONTENT_MANAGER: "مدير محتوى",
  ADMIN: "مدير المنصة",
};

export const ROLE_HINTS: Record<RoleCode, string> = {
  STUDENT: "يتدرّب ويحل الاختبارات فقط.",
  CONTENT_MANAGER: "يكتب الأسئلة ويراجعها، ولا ينشرها.",
  ADMIN: "كل الصلاحيات، ومنها النشر وإدارة الحسابات.",
};

export const STATUS_LABELS: Record<UserStatus, string> = {
  PENDING_VERIFICATION: "بانتظار التحقق",
  ACTIVE: "نشط",
  SUSPENDED: "موقوف",
  DEACTIVATED: "مُغلق",
};

export function listUsers(filter: UserListFilter) {
  const query = new URLSearchParams({ limit: String(filter.limit), offset: String(filter.offset) });
  if (filter.search) query.set("search", filter.search);
  if (filter.role) query.set("role", filter.role);
  return api<{ items: AdminUser[]; page: { hasMore: boolean } }>(`/admin/users?${query}`);
}

export const listRoles = () => api<{ items: AdminRole[] }>("/admin/roles");

export const setUserRoles = (userId: string, roles: RoleCode[]) =>
  api<AdminUser>(`/admin/users/${userId}/roles`, { method: "PUT", body: { roles } });

export const suspendUser = (userId: string) =>
  api<AdminUser>(`/admin/users/${userId}/suspend`, { method: "POST" });

export const reactivateUser = (userId: string) =>
  api<AdminUser>(`/admin/users/${userId}/reactivate`, { method: "POST" });
