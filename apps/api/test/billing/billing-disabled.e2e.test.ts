import { randomUUID } from "node:crypto";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { deleteE2eUsers, E2E_DATABASE_URL, e2eEmail, e2eSql } from "../support/e2e-database.js";
import { buildTestApp, testConfig } from "../support/test-app.js";

/** With no Stream credentials the API still runs; only selling is off. */

const COOKIE = "qup_session";
let app: NestFastifyApplication;
let student: string;

beforeAll(async () => {
  await deleteE2eUsers();
  ({ app } = await buildTestApp({
    config: testConfig({ DATABASE_URL: E2E_DATABASE_URL, AUTH_RATE_LIMIT_PER_MINUTE: "10000" }),
  }));
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email: e2eEmail("billing-off"), password: "billing off passphrase" },
  });
  student = response.cookies.find((c) => c.name === COOKIE)?.value ?? "";
});

afterAll(async () => {
  await app.close();
  await deleteE2eUsers();
  await e2eSql.end();
});

const errorCode = (r: { json: () => unknown }) =>
  (r.json() as { error: { code: string } }).error.code;

describe("billing without a payment provider", () => {
  it("answers checkout with a clear 503 instead of failing obscurely", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/payments",
      cookies: { [COOKIE]: student },
      headers: { "idempotency-key": randomUUID() },
      payload: { planId: randomUUID() },
    });
    expect(response.statusCode).toBe(503);
    expect(errorCode(response)).toBe("PAYMENTS_NOT_CONFIGURED");
  });

  it("does not accept webhooks", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/payments/webhooks/stream",
      payload: { event_type: "PAYMENT_SUCCEEDED" },
    });
    expect(response.statusCode).toBe(503);
  });

  it("still answers access questions", async () => {
    const examId = randomUUID();
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/exams/${examId}/my-access`,
      cookies: { [COOKIE]: student },
    });
    expect(response.json()).toEqual({ examId, hasAccess: false, activeUntil: null });
  });

  it("requires a session for student billing routes", async () => {
    for (const url of ["/api/v1/me/entitlements", `/api/v1/payments/${randomUUID()}`]) {
      expect((await app.inject({ method: "GET", url })).statusCode).toBe(401);
    }
  });
});
