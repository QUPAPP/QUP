import { Inject, Injectable } from "@nestjs/common";
import { type Database, tables } from "@qup/db";
import { and, eq, gt, isNull, ne } from "drizzle-orm";

import type { ActorContext } from "../../../common/actor.js";
import { AuditAction, writeAudit } from "../../../infrastructure/audit/audit-log.js";
import { DATABASE } from "../../../infrastructure/database/database.module.js";
import type { DbExecutor } from "../../../infrastructure/database/executor.js";
import { PgErrorCode, pgErrorInfo } from "../../../infrastructure/database/postgres-errors.js";
import { OutboxEventType, writeOutbox } from "../../../infrastructure/outbox/outbox.js";
import { IdentifierTaken } from "../domain/auth.errors.js";
import type {
  ActiveSession,
  AuthStore,
  EraseRefusal,
  NewSession,
  NewUser,
  RoleCode,
  StoredCredentials,
  UserAccess,
  UserProfile,
} from "../domain/ports.js";

const {
  users,
  authSessions,
  roles,
  userRoles,
  rolePermissions,
  permissions,
  oneTimeCodes,
  emailDeliveries,
  aiChatMessages,
  aiRuns,
  questionReports,
} = tables;

/** Bounded so a hostile User-Agent header cannot bloat the sessions table. */
const MAX_USER_AGENT_LENGTH = 512;

const STUDENT_ROLE: RoleCode = "STUDENT";

/**
 * Not an Argon2 hash, so no password can ever verify against it
 * (PasswordHasher.verify answers false for an unreadable hash).
 */
const ERASED_PASSWORD_HASH = "erased";

/** Kept in the delivery log in place of the address, so "how many mails bounced" still adds up. */
const ERASED_ADDRESS = "erased";

/**
 * What an erased account keeps of its person: nothing that identifies or reaches them.
 * The row itself stays — payments (a financial record the law asks to keep) and
 * learning evidence point at it — under status DEACTIVATED, which never signs in.
 */
const ERASED_PROFILE = {
  email: null,
  phone: null,
  displayName: null,
  passwordHash: ERASED_PASSWORD_HASH,
  status: "DEACTIVATED",
  emailVerifiedAt: null,
  phoneVerifiedAt: null,
  lastLoginAt: null,
  // termsVersion / termsAcceptedAt stay: they name no one, and show the data was processed with consent.
} as const;

const profileColumns = {
  id: users.id,
  email: users.email,
  phone: users.phone,
  displayName: users.displayName,
  status: users.status,
  emailVerifiedAt: users.emailVerifiedAt,
  termsVersion: users.termsVersion,
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
        const { consent, ...identity } = user;
        const [created] = await tx
          .insert(users)
          .values({
            ...identity,
            termsVersion: consent?.termsVersion ?? null,
            termsAcceptedAt: consent?.acceptedAt ?? null,
          })
          .returning(profileColumns);
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

  async findCredentialsById(userId: string): Promise<StoredCredentials | null> {
    const [row] = await this.db
      .select(credentialColumns)
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return row ?? null;
  }

  async updateDisplayName(userId: string, displayName: string | null): Promise<UserProfile | null> {
    const [row] = await this.db
      .update(users)
      .set({ displayName })
      .where(eq(users.id, userId))
      .returning(profileColumns);
    return row ?? null;
  }

  async updatePasswordHash(userId: string, passwordHash: string, at: Date): Promise<void> {
    // The notice that the password changed is queued with the change itself: it exists
    // exactly when the change committed, and goes out whenever the worker next runs.
    await this.db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash, updatedAt: at }).where(eq(users.id, userId));
      await writeOutbox(tx, {
        type: OutboxEventType.EmailRequested,
        aggregateType: "user",
        aggregateId: userId,
        payload: { kind: "PASSWORD_CHANGED", userId },
      });
    });
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

  async recordConsent(userId: string, termsVersion: string, at: Date): Promise<UserProfile | null> {
    const [row] = await this.db
      .update(users)
      .set({ termsVersion, termsAcceptedAt: at })
      .where(eq(users.id, userId))
      .returning(profileColumns);
    return row ?? null;
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

  async eraseAccount(
    userId: string,
    actor: ActorContext,
    at: Date,
  ): Promise<EraseRefusal | "ERASED"> {
    return this.db.transaction(async (tx) => {
      // Locked, so two erase requests (or an erase racing a role grant) are applied one after the other.
      const [user] = await tx
        .select({ erasedAt: users.erasedAt })
        .from(users)
        .where(eq(users.id, userId))
        .for("update");
      if (!user) return "NOT_FOUND";
      if (user.erasedAt) return "ALREADY_ERASED";

      const [staffRole] = await tx
        .select({ code: roles.code })
        .from(userRoles)
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .where(and(eq(userRoles.userId, userId), ne(roles.code, STUDENT_ROLE)))
        .limit(1);
      if (staffRole) return "HAS_STAFF_ROLE";

      await tx
        .update(users)
        .set({ ...ERASED_PROFILE, erasedAt: at, updatedAt: at })
        .where(eq(users.id, userId));
      await tx.delete(authSessions).where(eq(authSessions.userId, userId));
      await tx.delete(oneTimeCodes).where(eq(oneTimeCodes.userId, userId));
      await tx.delete(aiChatMessages).where(eq(aiChatMessages.studentId, userId));
      await tx.update(aiRuns).set({ output: null }).where(eq(aiRuns.requestedBy, userId));
      await tx
        .update(emailDeliveries)
        .set({ toAddress: ERASED_ADDRESS, lastError: null })
        .where(eq(emailDeliveries.userId, userId));
      await tx
        .update(questionReports)
        .set({ note: null })
        .where(eq(questionReports.reportedBy, userId));

      await writeAudit(tx, actor, {
        action: AuditAction.UserErased,
        resourceType: "user",
        resourceId: userId,
        metadata: { bySelf: actor.userId === userId },
      });
      return "ERASED";
    });
  }
}
