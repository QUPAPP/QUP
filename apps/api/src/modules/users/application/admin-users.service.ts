import { Inject, Injectable } from "@nestjs/common";

import type { ActorContext } from "../../../common/actor.js";
import { ACCOUNT_ERASURE, type AccountErasure } from "../../auth/auth.contract.js";
import type { RoleCode } from "../../auth/domain/ports.js";
import {
  ADMIN_USER_STORE,
  type AdminUserStore,
  type AdminUserView,
  type RoleView,
  type UserListFilter,
} from "../domain/ports.js";
import {
  AccountErased,
  CannotChangeOwnAccess,
  RolesRequired,
  StaffAccountMustLoseRolesFirst,
  UserNotFound,
} from "../domain/users.errors.js";

/** An erased account carries this status for good (auth module, eraseAccount). */
const ERASED_STATUS = "DEACTIVATED";

/**
 * Account administration (SECURITY.md "Authorization", users.manage): list
 * accounts, change their roles, suspend or reactivate them, and erase one on
 * its owner's request. Every change is audited in the same transaction.
 */
@Injectable()
export class AdminUsersService {
  constructor(
    @Inject(ADMIN_USER_STORE) private readonly store: AdminUserStore,
    @Inject(ACCOUNT_ERASURE) private readonly erasure: AccountErasure,
  ) {}

  list(filter: UserListFilter) {
    return this.store.list(filter);
  }

  async get(userId: string): Promise<AdminUserView> {
    const user = await this.store.find(userId);
    if (!user) throw new UserNotFound();
    return user;
  }

  roles(): Promise<RoleView[]> {
    return this.store.roles();
  }

  async setRoles(
    userId: string,
    roles: readonly RoleCode[],
    actor: ActorContext,
  ): Promise<AdminUserView> {
    this.assertNotSelf(userId, actor);
    if (roles.length === 0) throw new RolesRequired();
    await this.changeable(userId);
    await this.store.setRoles(userId, [...new Set(roles)], actor);
    return this.get(userId);
  }

  async suspend(userId: string, actor: ActorContext, at = new Date()): Promise<AdminUserView> {
    return this.setStatus(userId, "SUSPENDED", actor, at);
  }

  async reactivate(userId: string, actor: ActorContext, at = new Date()): Promise<AdminUserView> {
    return this.setStatus(userId, "ACTIVE", actor, at);
  }

  /**
   * Erases a student's account when they ask through support (privacy policy,
   * "الإتلاف"). Staff accounts lose their roles first; your own account is
   * erased from the account page, never from here.
   */
  async erase(userId: string, actor: ActorContext): Promise<AdminUserView> {
    this.assertNotSelf(userId, actor);
    const outcome = await this.erasure.erase(userId, actor);
    if (outcome === "NOT_FOUND") throw new UserNotFound();
    if (outcome === "HAS_STAFF_ROLE") throw new StaffAccountMustLoseRolesFirst();
    if (outcome === "ALREADY_ERASED") throw new AccountErased();
    return this.get(userId);
  }

  private async setStatus(
    userId: string,
    status: "ACTIVE" | "SUSPENDED",
    actor: ActorContext,
    at: Date,
  ): Promise<AdminUserView> {
    this.assertNotSelf(userId, actor);
    const user = await this.changeable(userId);
    if (user.status === status) return user;
    await this.store.setStatus(userId, status, actor, at);
    return this.get(userId);
  }

  /** The account, unless it was erased: nothing about an erased account changes again. */
  private async changeable(userId: string): Promise<AdminUserView> {
    const user = await this.get(userId);
    if (user.erasedAt !== null || user.status === ERASED_STATUS) throw new AccountErased();
    return user;
  }

  private assertNotSelf(userId: string, actor: ActorContext): void {
    if (actor.userId === userId) throw new CannotChangeOwnAccess();
  }
}
