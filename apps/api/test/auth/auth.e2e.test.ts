import { createHash } from "node:crypto";

import { Controller, Get } from "@nestjs/common";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Permission } from "../../src/modules/rbac/permissions.js";
import { RequirePermissions } from "../../src/modules/rbac/require-permissions.js";
import {
  deleteE2eUsers,
  E2E_DATABASE_URL,
  e2eEmail,
  e2ePhone,
  e2eSql,
  grantRole,
} from "../support/e2e-database.js";
import { buildTestApp, testConfig } from "../support/test-app.js";

/** Test-only route guarded by the publish permission (OPEN_QUESTIONS.md #14). */
@Controller("probe-rbac")
class PublishProbeController {
  @Get("publish")
  @RequirePermissions(Permission.QuestionsPublish)
  publish(): { ok: true } {
    return { ok: true };
  }
}

const COOKIE = "qup_session";
const PASSWORD = "correct horse battery staple";

let app: NestFastifyApplication;

beforeAll(async () => {
  await deleteE2eUsers();
  ({ app } = await buildTestApp({
    controllers: [PublishProbeController],
    config: testConfig({ DATABASE_URL: E2E_DATABASE_URL, AUTH_RATE_LIMIT_PER_MINUTE: "10000" }),
  }));
});

afterAll(async () => {
  await app.close();
  await deleteE2eUsers();
  await e2eSql.end();
});

interface Registered {
  userId: string;
  token: string;
}

async function register(body: Record<string, unknown>) {
  return app.inject({ method: "POST", url: "/api/v1/auth/register", payload: body });
}

async function registerStudent(email = e2eEmail("student")): Promise<Registered> {
  const response = await register({ email, password: PASSWORD });
  expect(response.statusCode).toBe(201);
  const token = response.cookies.find((c) => c.name === COOKIE)?.value;
  if (!token) throw new Error("no session cookie issued");
  return { userId: response.json<{ user: { id: string } }>().user.id, token };
}

function login(identifier: string, password = PASSWORD) {
  return app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { identifier, password },
  });
}

function me(token?: string) {
  return app.inject({
    method: "GET",
    url: "/api/v1/auth/me",
    ...(token ? { cookies: { [COOKIE]: token } } : {}),
  });
}

function errorCode(response: { json: () => unknown }): string {
  return (response.json() as { error: { code: string } }).error.code;
}

describe("registration", () => {
  it("creates a student with an email, issues a hardened session cookie", async () => {
    const response = await register({ email: e2eEmail("Mixed.Case"), password: PASSWORD });

    expect(response.statusCode).toBe(201);
    const { user } = response.json<{ user: Record<string, unknown> }>();
    expect(user.email).toMatch(/^mixed\.case-\d+@e2e\.qup\.test$/);
    expect(user).not.toHaveProperty("passwordHash");

    const cookie = response.cookies.find((c) => c.name === COOKIE);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/" });
  });

  it("creates a student with a phone only", async () => {
    const response = await register({ phone: e2ePhone(), password: PASSWORD });
    expect(response.statusCode).toBe(201);
  });

  it("stores an Argon2id hash, and only a digest of the session token", async () => {
    const { userId, token } = await registerStudent();

    const [user] = await e2eSql<{ password_hash: string }[]>`
      SELECT password_hash FROM users WHERE id = ${userId}`;
    expect(user?.password_hash).toMatch(/^\$argon2id\$/);

    const [session] = await e2eSql<{ token_hash: string }[]>`
      SELECT token_hash FROM auth_sessions WHERE user_id = ${userId}`;
    expect(session?.token_hash).toBe(createHash("sha256").update(token).digest("hex"));
  });

  it("requires an email or a phone", async () => {
    const response = await register({ password: PASSWORD });

    expect(response.statusCode).toBe(400);
    expect(errorCode(response)).toBe("VALIDATION_FAILED");
  });

  it("enforces the password policy", async () => {
    const response = await register({ email: e2eEmail("weak"), password: "short" });

    expect(response.statusCode).toBe(400);
    const { error } = response.json<{ error: { details: { path: string }[] } }>();
    expect(error.details.map((d) => d.path)).toContain("password");
  });

  it("rejects extra fields, so a client cannot assign itself a role", async () => {
    const response = await register({
      email: e2eEmail("sneaky"),
      password: PASSWORD,
      role: "ADMIN",
    });
    expect(response.statusCode).toBe(400);
  });

  it("refuses a duplicate email regardless of letter case", async () => {
    const email = e2eEmail("dup");
    await registerStudent(email);

    const response = await register({ email: email.toUpperCase(), password: PASSWORD });
    expect(response.statusCode).toBe(409);
    expect(errorCode(response)).toBe("IDENTIFIER_TAKEN");
  });
});

describe("login", () => {
  it("signs in with the email in any letter case, or with the phone", async () => {
    const email = e2eEmail("both");
    const phone = e2ePhone();
    expect((await register({ email, phone, password: PASSWORD })).statusCode).toBe(201);

    expect((await login(email.toUpperCase())).statusCode).toBe(200);
    expect((await login(phone)).statusCode).toBe(200);
  });

  it("answers a wrong password and an unknown account identically", async () => {
    const email = e2eEmail("known");
    await registerStudent(email);

    const wrongPassword = await login(email, "not the right password");
    const unknownAccount = await login(e2eEmail("unknown"));

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownAccount.statusCode).toBe(401);
    const strip = (r: typeof wrongPassword) => {
      const { error } = r.json<{ error: { code: string; message: string } }>();
      return { code: error.code, message: error.message };
    };
    expect(strip(wrongPassword)).toEqual(strip(unknownAccount));
    expect(strip(wrongPassword).code).toBe("INVALID_CREDENTIALS");
  });

  it("refuses a suspended account, and cuts off its existing sessions", async () => {
    const email = e2eEmail("suspended");
    const { userId, token } = await registerStudent(email);
    await e2eSql`UPDATE users SET status = 'SUSPENDED' WHERE id = ${userId}`;

    expect((await me(token)).statusCode).toBe(401);
    const response = await login(email);
    expect(response.statusCode).toBe(403);
    expect(errorCode(response)).toBe("ACCOUNT_DISABLED");
  });
});

describe("sessions", () => {
  it("requires a session for /auth/me and rejects a forged one", async () => {
    expect((await me()).statusCode).toBe(401);
    expect((await me("forged-token-value")).statusCode).toBe(401);
  });

  it("describes the signed-in student", async () => {
    const { token } = await registerStudent();
    const response = await me(token);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ roles: ["STUDENT"], permissions: [] });
  });

  it("logs out: the cookie is cleared and the old token stops working", async () => {
    const { token } = await registerStudent();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      cookies: { [COOKIE]: token },
    });

    expect(response.statusCode).toBe(204);
    const cleared = response.cookies.find((c) => c.name === COOKIE);
    expect(cleared?.value).toBe("");
    expect((await me(token)).statusCode).toBe(401);
  });

  it("signs out other devices while keeping the current one", async () => {
    const email = e2eEmail("devices");
    const { token: laptop } = await registerStudent(email);
    const phoneLogin = await login(email);
    const phone = phoneLogin.cookies.find((c) => c.name === COOKIE)?.value ?? "";

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/sessions/revoke",
      cookies: { [COOKIE]: laptop },
    });

    expect(response.statusCode).toBe(204);
    expect((await me(laptop)).statusCode).toBe(200);
    expect((await me(phone)).statusCode).toBe(401);
  });

  it("rejects an expired session", async () => {
    const { userId, token } = await registerStudent();
    await e2eSql`
      UPDATE auth_sessions SET expires_at = now() - interval '1 minute' WHERE user_id = ${userId}`;

    expect((await me(token)).statusCode).toBe(401);
  });
});

// OPEN_QUESTIONS.md #14 (decided 2026-09-22): only ADMIN publishes.
describe("permissions", () => {
  const publish = (token?: string) =>
    app.inject({
      method: "GET",
      url: "/api/v1/probe-rbac/publish",
      ...(token ? { cookies: { [COOKIE]: token } } : {}),
    });

  it("requires authentication before authorization", async () => {
    expect((await publish()).statusCode).toBe(401);
  });

  it("forbids students and content managers from publishing; allows admins", async () => {
    const student = await registerStudent();
    const manager = await registerStudent();
    const admin = await registerStudent();
    await grantRole(manager.userId, "CONTENT_MANAGER");
    await grantRole(admin.userId, "ADMIN");

    const asStudent = await publish(student.token);
    expect(asStudent.statusCode).toBe(403);
    expect(errorCode(asStudent)).toBe("FORBIDDEN");
    expect((await publish(manager.token)).statusCode).toBe(403);
    expect((await publish(admin.token)).statusCode).toBe(200);
  });

  it("keeps the code's permission list in sync with the seeded database", async () => {
    const rows = await e2eSql<{ code: string }[]>`SELECT code FROM permissions ORDER BY code`;
    expect(rows.map((r) => r.code)).toEqual(Object.values(Permission).sort());
  });
});

describe("production cookie", () => {
  it("is Secure and host-bound (__Host- prefix)", async () => {
    const { app: production } = await buildTestApp({
      config: testConfig({
        NODE_ENV: "production",
        DATABASE_URL: E2E_DATABASE_URL,
        AUTH_RATE_LIMIT_PER_MINUTE: "10000",
      }),
    });
    try {
      const response = await production.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: { email: e2eEmail("prod"), password: PASSWORD },
      });
      const cookie = response.cookies.find((c) => c.name === "__Host-qup_session");
      expect(cookie).toMatchObject({ secure: true, httpOnly: true, path: "/" });
    } finally {
      await production.close();
    }
  });
});
