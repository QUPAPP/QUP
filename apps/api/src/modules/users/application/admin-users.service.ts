import { Inject, Injectable } from "@nestjs/common";

import type { ActorContext } from "../../../common/actor.js";
import type { RoleCode } from "../../auth/domain/ports.js";
import {
  ADMIN_USER_STORE,
  type AdminUserStore,
  type AdminUserView,
  type RoleView,
  type UserListFilter,
} from "../domain/ports.js";
import { CannotChangeOwnAccess, RolesRequired, UserNotFound } from "../domain/users.errors.js";

/**
 * Account administration (SECURITY.md "Authorization", users.manage): list
 * accounts, change their roles, and suspend or reactivate them. Every change
 * is audited by the store in the same transaction.
 */
@Injectable()
export class AdminUsersService {
  constructor(@Inject(ADMIN_USER_STORE) private readonly store: AdminUserStore) {}

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
    await this.get(userId);
    await this.store.setRoles(userId, [...new Set(roles)], actor);
    return this.get(userId);
  }

  async suspend(userId: string, actor: ActorContext, at = new Date()): Promise<AdminUserView> {
    return this.setStatus(userId, "SUSPENDED", actor, at);
  }

  async reactivate(userId: string, actor: ActorContext, at = new Date()): Promise<AdminUserView> {
    return this.setStatus(userId, "ACTIVE", actor, at);
  }

  private async setStatus(
    userId: string,
    status: "ACTIVE" | "SUSPENDED",
    actor: ActorContext,
    at: Date,
  ): Promise<AdminUserView> {
    this.assertNotSelf(userId, actor);
    const user = await this.get(userId);
    if (user.status === status) return user;
    await this.store.setStatus(userId, status, actor, at);
    return this.get(userId);
  }

  private assertNotSelf(userId: string, actor: ActorContext): void {
    if (actor.userId === userId) throw new CannotChangeOwnAccess();
  }
}
