import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { DatabaseHealth } from "../src/infrastructure/database/database.module.js";
import { buildTestApp, type TestApp } from "./support/test-app.js";

/**
 * One application per file: nestjs-pino keeps process-wide logger state, so a
 * second app in the same file would write its logs to the first app's sink.
 * The database fake is switched per test instead.
 */

const DB_FAILURE = "password authentication failed for user admin";

let databaseUp = true;
const databaseHealth: DatabaseHealth = {
  ping: async () => {
    if (!databaseUp) throw new Error(DB_FAILURE);
  },
};

let current: TestApp;

beforeAll(async () => {
  current = await buildTestApp({ databaseHealth });
});

afterAll(async () => {
  await current.app.close();
});

beforeEach(() => {
  databaseUp = true;
});

describe("readiness", () => {
  it("reports ready when the database answers", async () => {
    const response = await current.app.inject({ method: "GET", url: "/health/ready" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", checks: { database: "up" } });
  });

  it("returns 503 without exposing why the database is unreachable", async () => {
    databaseUp = false;

    const response = await current.app.inject({ method: "GET", url: "/health/ready" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: "unavailable", checks: { database: "down" } });
    expect(response.payload).not.toContain("password");
  });

  it("records the cause server-side, tagged with the request id", async () => {
    databaseUp = false;

    const response = await current.app.inject({ method: "GET", url: "/health/ready" });
    const requestId = String(response.headers["x-request-id"]);

    const line = current.logs.text
      .split("\n")
      .find((l) => l.includes(DB_FAILURE) && l.includes(requestId));
    expect(line, "operators need the cause, correlated to the probe request").toBeDefined();
  });
});
