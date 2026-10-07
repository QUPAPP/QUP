import { Inject, Injectable } from "@nestjs/common";
import { type Database, tables } from "@qup/db";
import { and, eq, gt, isNull, ne } from "drizzle-orm";

import type { ActorContext } from "../../../common/actor.js";
import { AuditAction, writeAudit } from "../../../infrastructure/audit/audit-log.js";
import { DATABASE } from "../../../infrastructure/database/database.module.js";
import type { DbExecutor } from "../../../infrastructure/database/executor.js";
import { PgErrorCode, pgErrorInfo } from "../../../infrastructure/database/postgres-errors.js";
import { IdentifierTaken } from "../domain/auth.errors.js";
import type {
  ActiveSession,
  AuthStore,
  NewSession,
  NewUser,
  RoleCode,
  StoredCredentials,
  UserAccess,
  UserProfile,
} from "../domain/ports.js";

const { users, authSessions, roles, userRoles, rolePermissions, permissions } = tables;

/** Bounded so a hostile User-Agent header cannot bloat the sessions table. */
const MAX_USER_AGENT_LENGTH = 512;

const profileColumns = {
  id: users.id,
  email: users.email,
  phone: users.phone,
  displayName: users.displayName,
  status: users.status,
  createdAt: users.createdAt,
};

const credentialColumns = {
  userId: users.id,
  passwordHash: users.passwordHash,
  status: users.status,
};

async function findRoleId(executor: DbExecutor, role: RoleCode): Promise<string> {
  const [row] = await executor
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.code, role))
    .limit(1);
  if (!row) throw new Error(`Role ${role} is missing; apply migration 0003_seed_rbac.`);
  return row.id;
}

function violatedUniqueConstraint(error: unknown): string | undefined {
  const info = pgErrorInfo(error);
  return info?.code === PgErrorCode.uniqueViolation ? info.constraint : undefined;
}

@Injectable()
export class DrizzleAuthStore implements AuthStore {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findCredentialsByEmail(email: string): Promise<StoredCredentials | null> {
    const [row] = await this.db
      .select(credentialColumns)
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return row ?? null;
  }

  async findCredentialsByPhone(phone: string): Promise<StoredCredentials | null> {
    const [row] = await this.db
      .select(credentialColumns)
      .from(users)
      .where(eq(users.phone, phone))
      .limit(1);
    return row ?? null;
  }

  createStudent(user: NewUser): Promise<UserProfile> {
    return this.createUserWithRole(user, "STUDENT", null);
  }

  createAdmin(user: NewUser, actor: ActorContext): Promise<UserProfile> {
    return this.createUserWithRole(user, "ADMIN", actor);
  }

  async grantRole(userId: string, role: RoleCode, actor: ActorContext): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const roleId = await findRoleId(tx, role);
      const granted = await tx
        .insert(userRoles)
        .values({ userId, roleId, grantedBy: actor.userId })
        .onConflictDoNothing()
        .returning({ userId: userRoles.userId });
      if (granted.length === 0) return false;

      await writeAudit(tx, actor, {
        action: AuditAction.RoleGranted,
        resourceType: "user",
        resourceId: userId,
        metadata: { role },
      });
      return true;
    });
  }

  /**
   * One transaction: the user, its role and (when an actor is given) the audit
   * entry for the grant. A user without a role cannot exist.
   */
  private async createUserWithRole(
    user: NewUser,
    role: RoleCode,
    auditActor: ActorContext | null,
  ): Promise<UserProfile> {
    try {
      return await this.db.transaction(async (tx) => {
        const roleId = await findRoleId(tx, role);
        const [created] = await tx.insert(users).values(user).returning(profileColumns);
        if (!created) throw new Error("User insert returned no row.");

        await tx
          .insert(userRoles)
          .values({ userId: created.id, roleId, grantedBy: auditActor?.userId ?? null });
        if (auditActor) {
          await writeAudit(tx, auditActor, {
            action: AuditAction.RoleGranted,
            resourceType: "user",
            resourceId: created.id,
            metadata: { role },
          });
        }
        return created;
      });
    } catch (error) {
      // Checked at the database, not with a prior SELECT, so two simultaneous
      // sign-ups with the same email cannot both succeed.
      const constraint = violatedUniqueConstraint(error);
      if (constraint === "users_email_unique") throw new IdentifierTaken("email");
      if (constraint === "users_phone_unique") throw new IdentifierTaken("phone");
      throw error;
    }
  }

  async findProfile(userId: string): Promise<UserProfile | null> {
    const [row] = await this.db
      .select(profileColumns)
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return row ?? null;
  }

  async loadAccess(userId: string): Promise<UserAccess> {
    const rows = await this.db
      .select({ role: roles.code, permission: permissions.code })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
      .leftJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(eq(userRoles.userId, userId));

    const roleCodes = new Set<string>();
    const permissionCodes = new Set<string>();
    for (const row of rows) {
      roleCodes.add(row.role);
      if (row.permission) permissionCodes.add(row.permission);
    }
    return { roles: [...roleCodes], permissions: [...permissionCodes] };
  }

  async recordLogin(userId: string, at: Date): Promise<void> {
    await this.db.update(users).set({ lastLoginAt: at }).where(eq(users.id, userId));
  }

  async createSession(session: NewSession): Promise<string> {
    const [row] = await this.db
      .insert(authSessions)
      .values({
        ...session,
        userAgent: session.userAgent?.slice(0, MAX_USER_AGENT_LENGTH) ?? null,
      })
      .returning({ id: authSessions.id });
    if (!row) throw new Error("Session insert returned no row.");
    return row.id;
  }

  async findActiveSession(tokenHash: string, now: Date): Promise<ActiveSession | null> {
    const [row] = await this.db
      .select({
        sessionId: authSessions.id,
        userId: authSessions.userId,
        userStatus: users.status,
        lastSeenAt: authSessions.lastSeenAt,
      })
      .from(authSessions)
      .innerJoin(users, eq(users.id, authSessions.userId))
      .where(
        and(
          eq(authSessions.tokenHash, tokenHash),
          isNull(authSessions.revokedAt),
          gt(authSessions.expiresAt, now),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async touchSession(sessionId: string, at: Date): Promise<void> {
    await this.db
      .update(authSessions)
      .set({ lastSeenAt: at })
      .where(eq(authSessions.id, sessionId));
  }

  async revokeSession(sessionId: string, at: Date): Promise<void> {
    await this.db
      .update(authSessions)
      .set({ revokedAt: at })
      .where(and(eq(authSessions.id, sessionId), isNull(authSessions.revokedAt)));
  }

  async revokeOtherSessions(userId: string, keepSessionId: string, at: Date): Promise<number> {
    const revoked = await this.db
      .update(authSessions)
      .set({ revokedAt: at })
      .where(
        and(
          eq(authSessions.userId, userId),
          ne(authSessions.id, keepSessionId),
          isNull(authSessions.revokedAt),
        ),
      )
      .returning({ id: authSessions.id });
    return revoked.length;
  }
}
