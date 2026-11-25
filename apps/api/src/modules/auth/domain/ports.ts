import type { ActorContext } from "../../../common/actor.js";
import type { OneTimeCodePurpose } from "./otp-policy.js";

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
  /** When the person proved they can read mail sent to `email`; null until then. */
  emailVerifiedAt: Date | null;
  /** The terms-and-privacy version the person last accepted; null before consent was recorded. */
  termsVersion: string | null;
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
  /** What the person accepted at sign-up; null for accounts made by an operator (first admin). */
  consent: { termsVersion: string; acceptedAt: Date } | null;
}

/** Why erasing an account was refused. */
export type EraseRefusal = "NOT_FOUND" | "ALREADY_ERASED" | "HAS_STAFF_ROLE";

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
  findCredentialsById(userId: string): Promise<StoredCredentials | null>;
  updateDisplayName(userId: string, displayName: string | null): Promise<UserProfile | null>;
  updatePasswordHash(userId: string, passwordHash: string, at: Date): Promise<void>;
  loadAccess(userId: string): Promise<UserAccess>;
  recordLogin(userId: string, at: Date): Promise<void>;
  /** Records that the person accepted this terms version now (after the documents changed). */
  recordConsent(userId: string, termsVersion: string, at: Date): Promise<UserProfile | null>;

  createSession(session: NewSession): Promise<string>;
  /** A session that exists, is not revoked and has not expired at `now`. */
  findActiveSession(tokenHash: string, now: Date): Promise<ActiveSession | null>;
  touchSession(sessionId: string, at: Date): Promise<void>;
  revokeSession(sessionId: string, at: Date): Promise<void>;
  /** Revokes every active session of the user except `keepSessionId`. Returns how many. */
  revokeOtherSessions(userId: string, keepSessionId: string, at: Date): Promise<number>;

  /**
   * Erases a student account in one transaction, audited as `user.erase`
   * (account-erasure.ts says what goes and what stays). Staff accounts are
   * refused: their roles are taken away first, so the last-admin rule holds.
   */
  eraseAccount(userId: string, actor: ActorContext, at: Date): Promise<EraseRefusal | "ERASED">;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  /** False for a wrong password or an unreadable hash; never throws for either. */
  verify(passwordHash: string, password: string): Promise<boolean>;
}

export interface Clock {
  now(): Date;
}

/** What a live code looks like to the check that compares a guess with it. */
export interface StoredCode {
  codeHash: string;
  /** The address the code was sent to. */
  email: string;
}

export type IssueCodeResult =
  | { kind: "ISSUED"; codeId: string }
  | { kind: "TOO_SOON"; retryAfterSeconds: number }
  | { kind: "HOURLY_LIMIT" };

/** DONE: the guess was right and its effect happened. INVALID: wrong, expired, burned or none. */
export type ConsumeCodeResult = "DONE" | "INVALID";

export interface OtpStore {
  /**
   * Replaces the user's live code for this purpose with a new one, unless one
   * was issued too recently or too often (otp-policy.ts). One transaction.
   */
  issue(input: {
    userId: string;
    purpose: OneTimeCodePurpose;
    email: string;
    codeHash: string;
    now: Date;
  }): Promise<IssueCodeResult>;
  /** Removes a code that could not be sent, so it does not count against the person. */
  discard(codeId: string): Promise<void>;
  /**
   * Checks a guess against the live EMAIL_VERIFICATION code and, when right,
   * marks the address verified — one transaction. A wrong guess is counted and
   * the fifth burns the code.
   */
  confirmEmail(input: {
    userId: string;
    now: Date;
    matches: (code: StoredCode) => boolean;
  }): Promise<ConsumeCodeResult>;
  /**
   * Checks a guess against the live PASSWORD_RESET code and, when right, sets
   * the new password, signs the account out everywhere and audits it — one
   * transaction. Proving the mailbox also verifies the address.
   */
  resetPassword(input: {
    userId: string;
    now: Date;
    matches: (code: StoredCode) => boolean;
    passwordHash: string;
  }): Promise<ConsumeCodeResult>;
}

export const AUTH_STORE = Symbol("AUTH_STORE");
export const OTP_STORE = Symbol("OTP_STORE");
export const PASSWORD_HASHER = Symbol("PASSWORD_HASHER");
export const CLOCK = Symbol("CLOCK");
