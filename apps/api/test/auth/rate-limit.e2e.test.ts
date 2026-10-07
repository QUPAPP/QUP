import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { E2E_DATABASE_URL, e2eEmail, e2eSql } from "../support/e2e-database.js";
import { buildTestApp, testConfig } from "../support/test-app.js";

const AUTH_LIMIT = 3;

let app: NestFastifyApplication;

beforeAll(async () => {
  ({ app } = await buildTestApp({
    config: testConfig({
      DATABASE_URL: E2E_DATABASE_URL,
      AUTH_RATE_LIMIT_PER_MINUTE: String(AUTH_LIMIT),
    }),
  }));
});

afterAll(async () => {
  await app.close();
  await e2eSql.end();
});

// SECURITY.md — rate limiting on authentication.
describe("credential endpoint rate limit", () => {
  it("rejects further login attempts once the per-minute budget is spent", async () => {
    const attempt = () =>
      app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { identifier: e2eEmail("guess"), password: "guessing a password" },
      });

    for (let i = 0; i < AUTH_LIMIT; i++) {
      expect((await attempt()).statusCode).toBe(401);
    }
    const blocked = await attempt();

    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toMatchObject({ error: { code: "RATE_LIMITED" } });
  });

  it("does not apply the credential budget to other routes", async () => {
    // /auth/me is rate-limited only by the generous global budget, so well past
    // the credential limit it still answers normally (401: not signed in).
    for (let i = 0; i < AUTH_LIMIT * 2; i++) {
      const response = await app.inject({ method: "GET", url: "/api/v1/auth/me" });
      expect(response.statusCode).toBe(401);
    }
  });
});
