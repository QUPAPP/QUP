import type { ActorContext } from "../../../common/actor.js";
import type { RoleCode, UserStatus } from "../../auth/domain/ports.js";

/** An account as an admin sees it: contact details, status and roles. */
export interface AdminUserView {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
  status: UserStatus;
  roles: RoleCode[];
  createdAt: Date;
  lastLoginAt: Date | null;
}

export interface UserListFilter {
  /** Matches email, phone or display name, case-insensitively. */
  search?: string | undefined;
  role?: RoleCode | undefined;
  status?: UserStatus | undefined;
  limit: number;
  offset: number;
}

export interface RoleView {
  code: RoleCode;
  name: string;
  description: string | null;
  permissions: string[];
}

export interface RoleChange {
  granted: RoleCode[];
  revoked: RoleCode[];
}

export interface AdminUserStore {
  list(filter: UserListFilter): Promise<{ items: AdminUserView[]; hasMore: boolean }>;
  find(userId: string): Promise<AdminUserView | null>;
  roles(): Promise<RoleView[]>;
  /**
   * Replaces the user's roles with `next` and audits each grant and revocation,
   * in one transaction. Throws LastAdminRequired when the change would leave no
   * active admin.
   */
  setRoles(userId: string, next: readonly RoleCode[], actor: ActorContext): Promise<RoleChange>;
  /**
   * Sets the status and audits it. Suspending revokes every session of the user
   * in the same transaction, so the account is signed out everywhere at once.
   * Throws LastAdminRequired when it would suspend the last active admin.
   */
  setStatus(
    userId: string,
    status: "ACTIVE" | "SUSPENDED",
    actor: ActorContext,
    at: Date,
  ): Promise<void>;
}

export const ADMIN_USER_STORE = Symbol("ADMIN_USER_STORE");
