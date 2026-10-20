import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AdminBootstrapService } from "../../src/modules/auth/application/admin-bootstrap.service.js";
import {
  deleteE2eUsers,
  E2E_DATABASE_URL,
  e2eEmail,
  e2eSql,
  grantRole,
} from "../support/e2e-database.js";
import { buildTestApp, testConfig } from "../support/test-app.js";

const COOKIE = "qup_session";
const PASSWORD = "settings test passphrase";
const KEY = "assessment.preliminaryResult.levels";
const URL = `/admin/settings/${KEY}`;

let app: NestFastifyApplication;
let admin: string;
let adminId: string;
let manager: string;
/** Versions stored before this file ran; only newer ones are removed afterwards. */
let startVersion: number;

type Method = "GET" | "PUT";
function call(token: string, method: Method, url: string, payload?: unknown) {
  return app.inject({
    method,
    url: `/api/v1${url}`,
    cookies: { [COOKIE]: token },
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });
}

const code = (response: { json: () => unknown }) =>
  (response.json() as { error: { code: string } }).error.code;

const levels = (...fromPercentages: number[]) =>
  ["NEEDS_FOUNDATION", "BEGINNER", "INTERMEDIATE", "GOOD", "ADVANCED"].map((level, index) => ({
    level,
    fromPercentage: fromPercentages[index] ?? 0,
  }));

async function signIn(email: string): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { identifier: email, password: PASSWORD },
  });
  return response.cookies.find((c) => c.name === COOKIE)?.value ?? "";
}

async function currentVersion(): Promise<number> {
  const [row] = await e2eSql<{ version: number | null }[]>`
    SELECT max(version) AS version FROM system_settings WHERE key = ${KEY}`;
  return row?.version ?? 0;
}

beforeAll(async () => {
  await deleteE2eUsers();
  ({ app } = await buildTestApp({
    config: testConfig({ DATABASE_URL: E2E_DATABASE_URL, AUTH_RATE_LIMIT_PER_MINUTE: "10000" }),
  }));
  const adminEmail = e2eEmail("settings-admin");
  adminId = (
    await app.get(AdminBootstrapService).ensureAdmin({ email: adminEmail, password: PASSWORD })
  ).userId;
  admin = await signIn(adminEmail);

  const managerEmail = e2eEmail("settings-manager");
  const registered = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email: managerEmail, password: PASSWORD },
  });
  await grantRole(registered.json<{ user: { id: string } }>().user.id, "CONTENT_MANAGER");
  manager = await signIn(managerEmail);

  startVersion = await currentVersion();
});

afterAll(async () => {
  await e2eSql`DELETE FROM system_settings WHERE key = ${KEY} AND version > ${startVersion}`;
  await app.close();
  await deleteE2eUsers();
  await e2eSql.end();
});

describe("settings", () => {
  it("lists the level boundaries with their current version", async () => {
    const response = await call(admin, "GET", "/admin/settings");
    expect(response.statusCode).toBe(200);
    const setting = response
      .json<{ items: { key: string; version: number; value: unknown; valueType: string }[] }>()
      .items.find((item) => item.key === KEY);
    expect(setting).toMatchObject({ version: startVersion, valueType: "JSON" });
    if (startVersion === 0) expect(setting?.value).toEqual(levels(0, 40, 55, 70, 85));
  });

  it("saves a new version, audits it and keeps the history", async () => {
    const saved = await call(admin, "PUT", URL, {
      expectedVersion: startVersion,
      value: levels(0, 35, 50, 65, 80),
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({
      key: KEY,
      version: startVersion + 1,
      value: levels(0, 35, 50, 65, 80),
      updatedBy: adminId,
    });

    const [audit] = await e2eSql<{ actor_id: string }[]>`
      SELECT actor_id FROM audit_logs
      WHERE action = 'settings.update' AND resource_id = ${KEY}
      ORDER BY created_at DESC LIMIT 1`;
    expect(audit?.actor_id).toBe(adminId);

    const history = (await call(admin, "GET", `${URL}/versions`)).json<{
      items: { version: number }[];
    }>();
    expect(history.items[0]?.version).toBe(startVersion + 1);
    expect(history.items.at(-1)?.version).toBe(0);
  });

  it("refuses a stale save", async () => {
    const stale = await call(admin, "PUT", URL, {
      expectedVersion: startVersion,
      value: levels(0, 30, 50, 65, 80),
    });
    expect(stale.statusCode).toBe(409);
    expect(code(stale)).toBe("SETTING_VERSION_CONFLICT");
  });

  it("refuses boundaries that break the setting's rules", async () => {
    const invalid = await call(admin, "PUT", URL, {
      expectedVersion: await currentVersion(),
      value: levels(0, 60, 50, 65, 80),
    });
    expect(invalid.statusCode).toBe(422);
    const { error } = invalid.json<{ error: { code: string; details: { path: string }[] } }>();
    expect(error.code).toBe("SETTING_VALUE_INVALID");
    expect(error.details.map((d) => d.path)).toContain("2.fromPercentage");
  });

  it("returns 404 for an unknown key", async () => {
    const response = await call(admin, "PUT", "/admin/settings/assessment.unknown", {
      expectedVersion: 0,
      value: 1,
    });
    expect(response.statusCode).toBe(404);
    expect(code(response)).toBe("SETTING_NOT_FOUND");
  });

  it("is closed to content managers", async () => {
    expect((await call(manager, "GET", "/admin/settings")).statusCode).toBe(403);
    expect(
      (await call(manager, "PUT", URL, { expectedVersion: 0, value: levels(0, 1, 2, 3, 4) }))
        .statusCode,
    ).toBe(403);
  });
});
