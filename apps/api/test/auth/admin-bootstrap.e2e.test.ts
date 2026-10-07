import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AdminBootstrapService } from "../../src/modules/auth/application/admin-bootstrap.service.js";
import { Permission } from "../../src/modules/rbac/permissions.js";
import { deleteE2eUsers, E2E_DATABASE_URL, e2eEmail, e2eSql } from "../support/e2e-database.js";
import { buildTestApp, testConfig } from "../support/test-app.js";

const COOKIE = "qup_session";
const PASSWORD = "admin passphrase for testing";

let app: NestFastifyApplication;
let bootstrap: AdminBootstrapService;

beforeAll(async () => {
  await deleteE2eUsers();
  ({ app } = await buildTestApp({
    config: testConfig({ DATABASE_URL: E2E_DATABASE_URL, AUTH_RATE_LIMIT_PER_MINUTE: "10000" }),
  }));
  bootstrap = app.get(AdminBootstrapService);
});

afterAll(async () => {
  await app.close();
  await deleteE2eUsers();
  await e2eSql.end();
});

async function signIn(identifier: string, password: string) {
  return app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { identifier, password },
  });
}

describe("admin bootstrap", () => {
  it("creates an administrator who holds every permission", async () => {
    const email = e2eEmail("first-admin");
    const result = await bootstrap.ensureAdmin({ email, password: PASSWORD });
    expect(result.outcome).toBe("created");

    const login = await signIn(email, PASSWORD);
    const token = login.cookies.find((c) => c.name === COOKIE)?.value ?? "";
    const me = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      cookies: { [COOKIE]: token },
    });

    expect(me.json()).toMatchObject({
      roles: ["ADMIN"],
      permissions: Object.values(Permission).sort(),
    });
  });

  it("records the grant in the audit log, attributed to the system", async () => {
    const { userId } = await bootstrap.ensureAdmin({
      email: e2eEmail("audited"),
      password: PASSWORD,
    });

    const rows = await e2eSql<{ actor_id: string | null; metadata_redacted: unknown }[]>`
      SELECT actor_id, metadata_redacted FROM audit_logs
      WHERE action = 'user.role.grant' AND resource_id = ${userId}`;
    expect(rows).toEqual([{ actor_id: null, metadata_redacted: { role: "ADMIN" } }]);
  });

  it("is idempotent", async () => {
    const email = e2eEmail("twice");
    const first = await bootstrap.ensureAdmin({ email, password: PASSWORD });
    const second = await bootstrap.ensureAdmin({ email, password: PASSWORD });

    expect(second).toEqual({ userId: first.userId, outcome: "already-admin" });
  });

  it("promotes an existing account without changing its password", async () => {
    const email = e2eEmail("promoted");
    const originalPassword = "the student's own passphrase";
    const register = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email, password: originalPassword },
    });
    expect(register.statusCode).toBe(201);

    const result = await bootstrap.ensureAdmin({ email, password: "attacker chosen password" });

    expect(result.outcome).toBe("promoted");
    expect((await signIn(email, originalPassword)).statusCode).toBe(200);
    expect((await signIn(email, "attacker chosen password")).statusCode).toBe(401);
  });
});
