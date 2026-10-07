import type { PinoLogger } from "nestjs-pino";
import { describe, expect, it, vi } from "vitest";

import { AuthService } from "../../src/modules/auth/application/auth.service.js";
import { hashSessionToken } from "../../src/modules/auth/application/session-tokens.js";
import {
  AccountDisabled,
  InvalidCredentials,
  NotAuthenticated,
} from "../../src/modules/auth/domain/auth.errors.js";
import type {
  ActiveSession,
  AuthStore,
  PasswordHasher,
  StoredCredentials,
  UserStatus,
} from "../../src/modules/auth/domain/ports.js";
import { testConfig } from "../support/test-app.js";

const NOW = new Date("2026-09-22T12:00:00Z");
const FIVE_MINUTES_MS = 5 * 60_000;

// AuthService only calls info(); a full PinoLogger is not needed to test its logic.
const silentLogger = { info: () => {}, warn: () => {} } as unknown as PinoLogger;

function fakeStore(overrides: Partial<AuthStore> = {}): AuthStore {
  const unexpected = () => {
    throw new Error("unexpected store call");
  };
  return {
    findCredentialsByEmail: async () => null,
    findCredentialsByPhone: async () => null,
    createStudent: unexpected,
    createAdmin: unexpected,
    grantRole: unexpected,
    findProfile: async (id) => ({
      id,
      email: "s@qup.test",
      phone: null,
      displayName: null,
      status: "ACTIVE",
      createdAt: NOW,
    }),
    loadAccess: async () => ({ roles: ["STUDENT"], permissions: [] }),
    recordLogin: async () => {},
    createSession: async () => "session-1",
    findActiveSession: async () => null,
    touchSession: async () => {},
    revokeSession: async () => {},
    revokeOtherSessions: async () => 0,
    ...overrides,
  };
}

function fakeHasher(correctPassword: string): PasswordHasher & { verifyCalls: number } {
  const hasher = {
    verifyCalls: 0,
    hash: async (password: string) => `hash(${password})`,
    verify: async (hash: string, password: string) => {
      hasher.verifyCalls += 1;
      return hash === `hash(${correctPassword})` && password === correctPassword;
    },
  };
  return hasher;
}

function service(store: AuthStore, hasher: PasswordHasher): AuthService {
  return new AuthService(store, hasher, { now: () => NOW }, testConfig(), silentLogger);
}

const credentials = (status: UserStatus): StoredCredentials => ({
  userId: "user-1",
  passwordHash: "hash(correct horse battery)",
  status,
});

const client = { userAgent: null, ipAddress: null };

describe("login", () => {
  it("still runs a password verification for an unknown account (no timing oracle)", async () => {
    const hasher = fakeHasher("correct horse battery");
    const auth = service(fakeStore(), hasher);

    await expect(
      auth.login({ identifier: "nobody@qup.test", password: "anything" }, client),
    ).rejects.toBeInstanceOf(InvalidCredentials);
    expect(hasher.verifyCalls).toBe(1);
  });

  it("rejects a wrong password with the same error as an unknown account", async () => {
    const auth = service(
      fakeStore({ findCredentialsByEmail: async () => credentials("ACTIVE") }),
      fakeHasher("correct horse battery"),
    );

    await expect(
      auth.login({ identifier: "s@qup.test", password: "wrong password" }, client),
    ).rejects.toBeInstanceOf(InvalidCredentials);
  });

  it("reports a disabled account only after the correct password", async () => {
    const auth = service(
      fakeStore({ findCredentialsByEmail: async () => credentials("SUSPENDED") }),
      fakeHasher("correct horse battery"),
    );

    await expect(
      auth.login({ identifier: "s@qup.test", password: "wrong password" }, client),
    ).rejects.toBeInstanceOf(InvalidCredentials);
    await expect(
      auth.login({ identifier: "s@qup.test", password: "correct horse battery" }, client),
    ).rejects.toBeInstanceOf(AccountDisabled);
  });

  it("looks phones up by phone and rejects identifiers that are neither", async () => {
    const byPhone = vi.fn(async () => credentials("ACTIVE"));
    const auth = service(
      fakeStore({ findCredentialsByPhone: byPhone }),
      fakeHasher("correct horse battery"),
    );

    await auth.login({ identifier: "+966500000001", password: "correct horse battery" }, client);
    expect(byPhone).toHaveBeenCalledWith("+966500000001");

    await expect(
      auth.login({ identifier: "0500000001", password: "correct horse battery" }, client),
    ).rejects.toBeInstanceOf(InvalidCredentials);
  });

  it("stores only a hash of the issued session token", async () => {
    const createSession = vi.fn<AuthStore["createSession"]>(async () => "session-1");
    const auth = service(
      fakeStore({ findCredentialsByEmail: async () => credentials("ACTIVE"), createSession }),
      fakeHasher("correct horse battery"),
    );

    const { session } = await auth.login(
      { identifier: "s@qup.test", password: "correct horse battery" },
      client,
    );

    const stored = createSession.mock.calls[0]?.[0];
    expect(stored?.tokenHash).toBe(hashSessionToken(session.token));
    expect(stored?.tokenHash).not.toBe(session.token);
  });
});

describe("authenticate", () => {
  const active = (overrides: Partial<ActiveSession> = {}): ActiveSession => ({
    sessionId: "session-1",
    userId: "user-1",
    userStatus: "ACTIVE",
    lastSeenAt: NOW,
    ...overrides,
  });

  it("denies a session whose user was suspended after signing in", async () => {
    const auth = service(
      fakeStore({ findActiveSession: async () => active({ userStatus: "SUSPENDED" }) }),
      fakeHasher("x"),
    );
    await expect(auth.authenticate("token")).rejects.toBeInstanceOf(NotAuthenticated);
  });

  it("refreshes last_seen_at at most once per interval", async () => {
    const touch = vi.fn(async () => {});
    const recent = service(
      fakeStore({ findActiveSession: async () => active(), touchSession: touch }),
      fakeHasher("x"),
    );
    await recent.authenticate("token");
    expect(touch).not.toHaveBeenCalled();

    const stale = service(
      fakeStore({
        findActiveSession: async () =>
          active({ lastSeenAt: new Date(NOW.getTime() - FIVE_MINUTES_MS) }),
        touchSession: touch,
      }),
      fakeHasher("x"),
    );
    await stale.authenticate("token");
    expect(touch).toHaveBeenCalledOnce();
  });

  it("ignores permission codes the application does not know", async () => {
    const auth = service(
      fakeStore({
        findActiveSession: async () => active(),
        loadAccess: async () => ({
          roles: ["ADMIN"],
          permissions: ["questions.publish", "legacy.unknown"],
        }),
      }),
      fakeHasher("x"),
    );

    const principal = await auth.authenticate("token");
    expect([...principal.permissions]).toEqual(["questions.publish"]);
  });
});
