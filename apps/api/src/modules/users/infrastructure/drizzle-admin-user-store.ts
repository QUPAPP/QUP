import { Inject, Injectable } from "@nestjs/common";
import { type Database, tables } from "@qup/db";
import { and, desc, eq, ilike, inArray, isNull, ne, or, type SQL, sql } from "drizzle-orm";

import type { ActorContext } from "../../../common/actor.js";
import { AuditAction, writeAudit } from "../../../infrastructure/audit/audit-log.js";
import { DATABASE } from "../../../infrastructure/database/database.module.js";
import type { DbExecutor } from "../../../infrastructure/database/executor.js";
import type { RoleCode, UserStatus } from "../../auth/domain/ports.js";
import type {
  AdminUserStore,
  AdminUserView,
  RoleChange,
  RoleView,
  UserListFilter,
} from "../domain/ports.js";
import { LastAdminRequired } from "../domain/users.errors.js";

const { users, roles, userRoles, rolePermissions, permissions, authSessions } = tables;

const ADMIN: RoleCode = "ADMIN";

/** `%` and `_` in a search are literal characters, not wildcards. */
function likePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

const userColumns = {
  id: users.id,
  email: users.email,
  phone: users.phone,
  displayName: users.displayName,
  status: users.status,
  createdAt: users.createdAt,
  lastLoginAt: users.lastLoginAt,
};

type UserRow = Omit<AdminUserView, "roles">;

async function withRoles(executor: DbExecutor, rows: UserRow[]): Promise<AdminUserView[]> {
  if (rows.length === 0) return [];
  const grants = await executor
    .select({ userId: userRoles.userId, code: roles.code })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(
      inArray(
        userRoles.userId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(roles.code);
  const byUser = new Map<string, RoleCode[]>();
  for (const grant of grants) {
    byUser.set(grant.userId, [...(byUser.get(grant.userId) ?? []), grant.code as RoleCode]);
  }
  return rows.map((row) => ({ ...row, roles: byUser.get(row.id) ?? [] }));
}

function hasRole(role: RoleCode): SQL {
  return sql`exists (SELECT 1 FROM ${userRoles} JOIN ${roles} ON ${roles.id} = ${userRoles.roleId}
    WHERE ${userRoles.userId} = ${users.id} AND ${roles.code} = ${role})`;
}

@Injectable()
export class DrizzleAdminUserStore implements AdminUserStore {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(filter: UserListFilter) {
    const conditions: SQL[] = [];
    if (filter.search) {
      const pattern = likePattern(filter.search);
      const match = or(
        ilike(users.email, pattern),
        ilike(users.phone, pattern),
        ilike(users.displayName, pattern),
      );
      if (match) conditions.push(match);
    }
    if (filter.role) conditions.push(hasRole(filter.role));
    if (filter.status) conditions.push(eq(users.status, filter.status));

    const rows = await this.db
      .select(userColumns)
      .from(users)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(users.createdAt), desc(users.id))
      .limit(filter.limit + 1)
      .offset(filter.offset);
    return {
      items: await withRoles(this.db, rows.slice(0, filter.limit)),
      hasMore: rows.length > filter.limit,
    };
  }

  async find(userId: string): Promise<AdminUserView | null> {
    const rows = await this.db.select(userColumns).from(users).where(eq(users.id, userId));
    const [user] = await withRoles(this.db, rows);
    return user ?? null;
  }

  async roles(): Promise<RoleView[]> {
    const rows = await this.db
      .select({
        code: roles.code,
        name: roles.name,
        description: roles.description,
        permission: permissions.code,
      })
      .from(roles)
      .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
      .leftJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .orderBy(roles.code, permissions.code);

    const byCode = new Map<string, RoleView>();
    for (const row of rows) {
      const role = byCode.get(row.code) ?? {
        code: row.code as RoleCode,
        name: row.name,
        description: row.description,
        permissions: [],
      };
      if (row.permission) role.permissions.push(row.permission);
      byCode.set(row.code, role);
    }
    return [...byCode.values()];
  }

  async setRoles(
    userId: string,
    next: readonly RoleCode[],
    actor: ActorContext,
  ): Promise<RoleChange> {
    return this.db.transaction(async (tx) => {
      await lockAdminRole(tx);
      const current = await rolesOf(tx, userId);
      const granted = next.filter((role) => !current.includes(role));
      const revoked = current.filter((role) => !next.includes(role));

      if (revoked.includes(ADMIN)) await assertAnotherActiveAdmin(tx, userId);

      if (granted.length > 0) {
        const roleRows = await tx
          .select({ id: roles.id })
          .from(roles)
          .where(inArray(roles.code, granted));
        await tx
          .insert(userRoles)
          .values(roleRows.map((role) => ({ userId, roleId: role.id, grantedBy: actor.userId })))
          .onConflictDoNothing();
      }
      if (revoked.length > 0) {
        const roleIds = tx.select({ id: roles.id }).from(roles).where(inArray(roles.code, revoked));
        await tx
          .delete(userRoles)
          .where(and(eq(userRoles.userId, userId), inArray(userRoles.roleId, roleIds)));
      }

      for (const role of granted) {
        await writeAudit(tx, actor, roleAudit(AuditAction.RoleGranted, userId, role));
      }
      for (const role of revoked) {
        await writeAudit(tx, actor, roleAudit(AuditAction.RoleRevoked, userId, role));
      }
      return { granted, revoked };
    });
  }

  async setStatus(
    userId: string,
    status: "ACTIVE" | "SUSPENDED",
    actor: ActorContext,
    at: Date,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await lockAdminRole(tx);
      if (status === "SUSPENDED" && (await rolesOf(tx, userId)).includes(ADMIN)) {
        await assertAnotherActiveAdmin(tx, userId);
      }
      await tx.update(users).set({ status, updatedAt: at }).where(eq(users.id, userId));
      if (status === "SUSPENDED") {
        await tx
          .update(authSessions)
          .set({ revokedAt: at })
          .where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt)));
      }
      await writeAudit(tx, actor, {
        action: status === "SUSPENDED" ? AuditAction.UserSuspended : AuditAction.UserReactivated,
        resourceType: "user",
        resourceId: userId,
      });
    });
  }
}

/**
 * Serialises every change that can remove an admin. The caller is always an
 * active admin, so the last-admin check only bites in a race: two admins
 * demoting (or suspending) each other at the same moment. With the lock, the
 * second change sees the first and is refused instead of leaving no admin.
 */
async function lockAdminRole(tx: DbExecutor): Promise<void> {
  await tx.select({ id: roles.id }).from(roles).where(eq(roles.code, ADMIN)).for("update");
}

async function rolesOf(tx: DbExecutor, userId: string): Promise<RoleCode[]> {
  const rows = await tx
    .select({ code: roles.code })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(userRoles.userId, userId));
  return rows.map((row) => row.code as RoleCode);
}

async function assertAnotherActiveAdmin(tx: DbExecutor, exceptUserId: string): Promise<void> {
  const active: UserStatus = "ACTIVE";
  const [other] = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(ne(users.id, exceptUserId), eq(users.status, active), hasRole(ADMIN)))
    .limit(1);
  if (!other) throw new LastAdminRequired();
}

function roleAudit(action: AuditAction, userId: string, role: RoleCode) {
  return { action, resourceType: "user", resourceId: userId, metadata: { role } };
}
