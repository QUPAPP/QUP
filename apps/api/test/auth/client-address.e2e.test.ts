import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { E2E_DATABASE_URL, e2eEmail, e2eSql } from "../support/e2e-database.js";
import { buildTestApp, TEST_PROXY_SECRET, testConfig } from "../support/test-app.js";

/**
 * C4: rate limits count per client, and the client address cannot be chosen
 * by the client (SECURITY.md "rate limiting"). Behind CranL the API trusts one
 * proxy hop; the web app vouches for its callers with the shared secret.
 */

const AUTH_LIMIT = 2;

let app: NestFastifyApplication;

function login(headers: Record<string, string>) {
  return app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    headers,
    payload: { identifier: e2eEmail("guess"), password: "guessing a password" },
  });
}

/** Spends the budget with the given headers; returns the status of the next attempt. */
async function afterBudget(headers: (attempt: number) => Record<string, string>) {
  for (let attempt = 0; attempt < AUTH_LIMIT; attempt++) {
    expect((await login(headers(attempt))).statusCode).toBe(401);
  }
  return (await login(headers(AUTH_LIMIT))).statusCode;
}

beforeAll(async () => {
  ({ app } = await buildTestApp({
    config: testConfig({
      DATABASE_URL: E2E_DATABASE_URL,
      AUTH_RATE_LIMIT_PER_MINUTE: String(AUTH_LIMIT),
      TRUST_PROXY: "1",
    }),
  }));
});

afterAll(async () => {
  await app.close();
  await e2eSql.end();
});

describe("client address", () => {
  it("ignores forwarded addresses written by the client", async () => {
    // The edge proxy appends what it saw (198.51.100.7); the left-most entries are the client's.
    const status = await afterBudget((attempt) => ({
      "x-forwarded-for": `10.0.0.${attempt}, 198.51.100.7`,
    }));
    expect(status).toBe(429);
  });

  it("counts each client the web app vouches for separately", async () => {
    const status = await afterBudget((attempt) => ({
      "x-qup-proxy-secret": TEST_PROXY_SECRET,
      // The same web server, but a different student on every request.
      "x-qup-client-ip": `203.0.113.${attempt + 1}`,
      "x-forwarded-for": "192.0.2.50",
    }));
    expect(status).toBe(401);
  });

  it("does not believe a client address without the secret", async () => {
    const status = await afterBudget((attempt) => ({
      "x-qup-proxy-secret": "not-the-secret-0123456789abcdefghij",
      "x-qup-client-ip": `203.0.113.${100 + attempt}`,
      "x-forwarded-for": "192.0.2.60",
    }));
    expect(status).toBe(429);
  });

  it("does not believe a malformed client address", async () => {
    const status = await afterBudget((attempt) => ({
      "x-qup-proxy-secret": TEST_PROXY_SECRET,
      "x-qup-client-ip": `not-an-address-${attempt}`,
      "x-forwarded-for": "192.0.2.70",
    }));
    expect(status).toBe(429);
  });
});
