import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  deleteE2eUsers,
  E2E_DATABASE_URL,
  e2eEmail,
  e2eSql,
  grantRole,
} from "../support/e2e-database.js";
import { buildTestApp, testConfig } from "../support/test-app.js";

/** Admin account management: list, roles, suspend and reactivate (users.manage). */

const COOKIE = "qup_session";
const PASSWORD = "admin users passphrase";

let app: NestFastifyApplication;
let admin: { token: string; id: string; email: string };
let student: { token: string; id: string; email: string };

async function register(label: string) {
  const email = e2eEmail(label);
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email, password: PASSWORD, displayName: label },
  });
  return {
    email,
    token: response.cookies.find((c) => c.name === COOKIE)?.value ?? "",
    id: response.json<{ user: { id: string } }>().user.id,
  };
}

function call(token: string, method: "GET" | "POST" | "PUT", url: string, payload?: object) {
  return app.inject({
    method,
    url: `/api/v1${url}`,
    cookies: { [COOKIE]: token },
    ...(payload ? { payload: payload as Record<string, unknown> } : {}),
  });
}

beforeAll(async () => {
  await deleteE2eUsers();
  ({ app } = await buildTestApp({
    config: testConfig({ DATABASE_URL: E2E_DATABASE_URL, AUTH_RATE_LIMIT_PER_MINUTE: "10000" }),
  }));
  admin = await register("users-admin");
  await grantRole(admin.id, "ADMIN");
  student = await register("users-student");
});

afterAll(async () => {
  await app.close();
  await deleteE2eUsers();
  await e2eSql.end();
});

describe("admin users", () => {
  it("is closed to accounts without users.manage", async () => {
    const response = await call(student.token, "GET", "/admin/users");
    expect(response.statusCode).toBe(403);
  });

  it("lists and searches accounts with their roles", async () => {
    const response = await call(admin.token, "GET", `/admin/users?search=${student.email}`);
    expect(response.statusCode).toBe(200);
    const body = response.json<{ items: { id: string; roles: string[] }[] }>();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ id: student.id, roles: ["STUDENT"] });

    const admins = await call(admin.token, "GET", "/admin/users?role=ADMIN&limit=100");
    const ids = admins.json<{ items: { id: string }[] }>().items.map((user) => user.id);
    expect(ids).toContain(admin.id);
    expect(ids).not.toContain(student.id);
  });

  it("treats search wildcards as literal text", async () => {
    const response = await call(admin.token, "GET", "/admin/users?search=%25");
    expect(response.statusCode).toBe(200);
    const items = response.json<{ items: { email: string | null }[] }>().items;
    expect(items.every((user) => user.email?.includes("%") ?? false)).toBe(true);
  });

  it("lists roles with their permissions", async () => {
    const response = await call(admin.token, "GET", "/admin/roles");
    const roles = response.json<{ items: { code: string; permissions: string[] }[] }>().items;
    expect(roles.find((role) => role.code === "ADMIN")?.permissions).toContain("users.manage");
    expect(roles.find((role) => role.code === "STUDENT")?.permissions).toEqual([]);
  });

  it("changes roles, audits each change, and the new access applies at once", async () => {
    const promoted = await call(admin.token, "PUT", `/admin/users/${student.id}/roles`, {
      roles: ["STUDENT", "CONTENT_MANAGER"],
    });
    expect(promoted.statusCode).toBe(200);
    expect(promoted.json<{ roles: string[] }>().roles).toEqual(["CONTENT_MANAGER", "STUDENT"]);
    expect((await call(student.token, "GET", "/admin/questions")).statusCode).toBe(200);

    const demoted = await call(admin.token, "PUT", `/admin/users/${student.id}/roles`, {
      roles: ["STUDENT"],
    });
    expect(demoted.json<{ roles: string[] }>().roles).toEqual(["STUDENT"]);
    expect((await call(student.token, "GET", "/admin/questions")).statusCode).toBe(403);

    const audit = await e2eSql<{ action: string; actor_id: string }[]>`
      SELECT action, actor_id FROM audit_logs
       WHERE resource_type = 'user' AND resource_id = ${student.id}
         AND action IN ('user.role.grant', 'user.role.revoke')
       ORDER BY created_at`;
    expect(audit.map((row) => row.action)).toEqual(["user.role.grant", "user.role.revoke"]);
    expect(audit.every((row) => row.actor_id === admin.id)).toBe(true);
  });

  it("refuses an empty role list and unknown roles", async () => {
    const empty = await call(admin.token, "PUT", `/admin/users/${student.id}/roles`, { roles: [] });
    expect(empty.statusCode).toBe(400);
    const unknown = await call(admin.token, "PUT", `/admin/users/${student.id}/roles`, {
      roles: ["OWNER"],
    });
    expect(unknown.statusCode).toBe(400);
  });

  it("does not let an admin change their own access", async () => {
    const roles = await call(admin.token, "PUT", `/admin/users/${admin.id}/roles`, {
      roles: ["STUDENT"],
    });
    expect(roles.json<{ error: { code: string } }>().error.code).toBe("CANNOT_CHANGE_OWN_ACCESS");
    const suspend = await call(admin.token, "POST", `/admin/users/${admin.id}/suspend`);
    expect(suspend.json<{ error: { code: string } }>().error.code).toBe("CANNOT_CHANGE_OWN_ACCESS");
  });

  it("suspends an account, signs it out everywhere, and reactivates it", async () => {
    const suspended = await call(admin.token, "POST", `/admin/users/${student.id}/suspend`);
    expect(suspended.statusCode).toBe(200);
    expect(suspended.json<{ status: string }>().status).toBe("SUSPENDED");
    expect((await call(student.token, "GET", "/auth/me")).statusCode).toBe(401);

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { identifier: student.email, password: PASSWORD },
    });
    expect(login.statusCode).toBe(403);

    const reactivated = await call(admin.token, "POST", `/admin/users/${student.id}/reactivate`);
    expect(reactivated.json<{ status: string }>().status).toBe("ACTIVE");
    const again = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { identifier: student.email, password: PASSWORD },
    });
    expect(again.statusCode).toBe(200);
  });

  it("lets one admin demote another", async () => {
    const other = await register("users-other-admin");
    await grantRole(other.id, "ADMIN");
    const demoted = await call(other.token, "PUT", `/admin/users/${admin.id}/roles`, {
      roles: ["STUDENT"],
    });
    expect(demoted.statusCode).toBe(200);
    // The demoted admin loses access on their next request.
    expect((await call(admin.token, "GET", "/admin/users")).statusCode).toBe(403);
  });
});
