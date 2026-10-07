import type { ActorContext } from "../../../common/actor.js";

/**
 * Ports the auth application layer depends on. Implementations live in
 * ../infrastructure; the domain and application code never import Drizzle,
 * Argon2 or Nest directly (ARCHITECTURE.md §5, CODING_STANDARDS.md DIP).
 */

export type UserStatus = "PENDING_VERIFICATION" | "ACTIVE" | "SUSPENDED" | "DEACTIVATED";

export interface UserProfile {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
  status: UserStatus;
  createdAt: Date;
}

export interface StoredCredentials {
  userId: string;
  passwordHash: string;
  status: UserStatus;
}

export interface NewUser {
  email: string | null;
  phone: string | null;
  passwordHash: string;
  displayName: string | null;
}

/** Role codes seeded by 0003_seed_rbac. */
export type RoleCode = "STUDENT" | "CONTENT_MANAGER" | "ADMIN";

export interface NewSession {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent: string | null;
  ipAddress: string | null;
}

export interface ActiveSession {
  sessionId: string;
  userId: string;
  userStatus: UserStatus;
  lastSeenAt: Date | null;
}

export interface UserAccess {
  roles: string[];
  permissions: string[];
}

export interface AuthStore {
  findCredentialsByEmail(email: string): Promise<StoredCredentials | null>;
  findCredentialsByPhone(phone: string): Promise<StoredCredentials | null>;
  /** Creates the user with the STUDENT role atomically. Throws IdentifierTaken on a duplicate. */
  createStudent(user: NewUser): Promise<UserProfile>;
  /** Creates the user with the ADMIN role and audits the grant, atomically. */
  createAdmin(user: NewUser, actor: ActorContext): Promise<UserProfile>;
  /** Grants a role and audits it. Returns false when the user already held it. */
  grantRole(userId: string, role: RoleCode, actor: ActorContext): Promise<boolean>;
  findProfile(userId: string): Promise<UserProfile | null>;
  loadAccess(userId: string): Promise<UserAccess>;
  recordLogin(userId: string, at: Date): Promise<void>;

  createSession(session: NewSession): Promise<string>;
  /** A session that exists, is not revoked and has not expired at `now`. */
  findActiveSession(tokenHash: string, now: Date): Promise<ActiveSession | null>;
  touchSession(sessionId: string, at: Date): Promise<void>;
  revokeSession(sessionId: string, at: Date): Promise<void>;
  /** Revokes every active session of the user except `keepSessionId`. Returns how many. */
  revokeOtherSessions(userId: string, keepSessionId: string, at: Date): Promise<number>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  /** False for a wrong password or an unreadable hash; never throws for either. */
  verify(passwordHash: string, password: string): Promise<boolean>;
}

export interface Clock {
  now(): Date;
}

export const AUTH_STORE = Symbol("AUTH_STORE");
export const PASSWORD_HASHER = Symbol("PASSWORD_HASHER");
export const CLOCK = Symbol("CLOCK");
