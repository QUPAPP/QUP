import { randomBytes } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import { APP_CONFIG, type AppConfig } from "../../../config/app-config.js";
import { isPermission } from "../../rbac/permissions.js";
import { AccountDisabled, InvalidCredentials, NotAuthenticated } from "../domain/auth.errors.js";
import { parseSignInIdentifier } from "../domain/identifiers.js";
import {
  AUTH_STORE,
  type AuthStore,
  CLOCK,
  type Clock,
  PASSWORD_HASHER,
  type PasswordHasher,
  type StoredCredentials,
  type UserProfile,
} from "../domain/ports.js";
import type { Principal } from "../domain/principal.js";
import { generateSessionToken, hashSessionToken } from "./session-tokens.js";

export interface RegisterCommand {
  email?: string | undefined;
  phone?: string | undefined;
  password: string;
  displayName?: string | undefined;
}

export interface LoginCommand {
  identifier: string;
  password: string;
}

/** Where a request came from, recorded on the session for the user's own review. */
export interface ClientContext {
  userAgent: string | null;
  ipAddress: string | null;
}

export interface IssuedSession {
  token: string;
  expiresAt: Date;
}

export interface CurrentUser {
  user: UserProfile;
  roles: string[];
  permissions: string[];
}

const MILLISECONDS_PER_HOUR = 3_600_000;
/** Bounds writes: last_seen_at is refreshed at most this often per session. */
const SESSION_TOUCH_INTERVAL_MS = 5 * 60_000;
const DUMMY_PASSWORD_BYTES = 32;

@Injectable()
export class AuthService {
  /**
   * Hash of a random throwaway password. Verifying against it when the account
   * does not exist makes "unknown user" cost the same as "wrong password", so
   * response time does not reveal which identifiers are registered.
   */
  private dummyHash: Promise<string> | undefined;

  constructor(
    @Inject(AUTH_STORE) private readonly store: AuthStore,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @InjectPinoLogger(AuthService.name) private readonly logger: PinoLogger,
  ) {}

  async register(
    command: RegisterCommand,
    client: ClientContext,
  ): Promise<{ user: UserProfile; session: IssuedSession }> {
    // Hash before touching the database: Argon2 is deliberately slow and must
    // not hold a transaction open.
    const passwordHash = await this.hasher.hash(command.password);
    const user = await this.store.createStudent({
      email: command.email ?? null,
      phone: command.phone ?? null,
      passwordHash,
      displayName: command.displayName ?? null,
    });
    const session = await this.openSession(user.id, client);
    this.logger.info({ userId: user.id }, "User registered");
    return { user, session };
  }

  async login(
    command: LoginCommand,
    client: ClientContext,
  ): Promise<{ user: UserProfile; session: IssuedSession }> {
    const credentials = await this.findCredentials(command.identifier);

    if (!credentials) {
      await this.hasher.verify(await this.getDummyHash(), command.password);
      throw new InvalidCredentials();
    }
    if (!(await this.hasher.verify(credentials.passwordHash, command.password))) {
      this.logger.info({ userId: credentials.userId }, "Login rejected: wrong password");
      throw new InvalidCredentials();
    }
    if (credentials.status !== "ACTIVE") throw new AccountDisabled();

    const user = await this.store.findProfile(credentials.userId);
    if (!user) throw new InvalidCredentials();

    await this.store.recordLogin(user.id, this.clock.now());
    const session = await this.openSession(user.id, client);
    this.logger.info({ userId: user.id }, "User logged in");
    return { user, session };
  }

  /** Resolves a session cookie into a principal, or throws NotAuthenticated. */
  async authenticate(token: string): Promise<Principal> {
    const now = this.clock.now();
    const session = await this.store.findActiveSession(hashSessionToken(token), now);
    // A suspended account loses access immediately, not when its sessions expire.
    if (session?.userStatus !== "ACTIVE") throw new NotAuthenticated();

    const lastSeen = session.lastSeenAt?.getTime() ?? 0;
    if (now.getTime() - lastSeen >= SESSION_TOUCH_INTERVAL_MS) {
      await this.store.touchSession(session.sessionId, now);
    }

    const access = await this.store.loadAccess(session.userId);
    return {
      userId: session.userId,
      sessionId: session.sessionId,
      roles: access.roles,
      permissions: new Set(access.permissions.filter(isPermission)),
    };
  }

  async logout(principal: Principal): Promise<void> {
    await this.store.revokeSession(principal.sessionId, this.clock.now());
    this.logger.info({ userId: principal.userId }, "User logged out");
  }

  async revokeOtherSessions(principal: Principal): Promise<number> {
    const revoked = await this.store.revokeOtherSessions(
      principal.userId,
      principal.sessionId,
      this.clock.now(),
    );
    this.logger.info({ userId: principal.userId, revoked }, "Other sessions revoked");
    return revoked;
  }

  async currentUser(principal: Principal): Promise<CurrentUser> {
    const user = await this.store.findProfile(principal.userId);
    if (!user) throw new NotAuthenticated();
    return {
      user,
      roles: [...principal.roles].sort(),
      permissions: [...principal.permissions].sort(),
    };
  }

  private async findCredentials(rawIdentifier: string): Promise<StoredCredentials | null> {
    const identifier = parseSignInIdentifier(rawIdentifier);
    if (!identifier) return null;
    return identifier.kind === "email"
      ? this.store.findCredentialsByEmail(identifier.value)
      : this.store.findCredentialsByPhone(identifier.value);
  }

  private async openSession(userId: string, client: ClientContext): Promise<IssuedSession> {
    const token = generateSessionToken();
    const expiresAt = new Date(
      this.clock.now().getTime() + this.config.session.ttlHours * MILLISECONDS_PER_HOUR,
    );
    await this.store.createSession({
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt,
      userAgent: client.userAgent,
      ipAddress: client.ipAddress,
    });
    return { token, expiresAt };
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.hasher.hash(randomBytes(DUMMY_PASSWORD_BYTES).toString("hex"));
    return this.dummyHash;
  }
}
