import { describe, expect, it } from "vitest";

import { InvalidConfigError, loadConfig } from "../src/config/app-config.js";

const VALID_URL = "postgresql://user:pass@db.internal:5432/qup_db";
/** Production requires the web proxy's shared secret. */
const PROXY_SECRET = "a-proxy-secret-that-is-long-enough-1234";
const PRODUCTION = { NODE_ENV: "production", PROXY_SHARED_SECRET: PROXY_SECRET };

function loadExpectingFailure(env: Record<string, string>): InvalidConfigError {
  try {
    loadConfig(env);
  } catch (error) {
    if (error instanceof InvalidConfigError) return error;
    throw error;
  }
  throw new Error("expected configuration to be rejected");
}

describe("configuration", () => {
  it("applies safe defaults when only DATABASE_URL is provided", () => {
    const config = loadConfig({ DATABASE_URL: VALID_URL });

    expect(config.environment).toBe("development");
    expect(config.server.port).toBe(3000);
    expect(config.server.trustProxy).toBe(false);
    expect(config.cors.allowedOrigins).toEqual([]);
  });

  it("refuses to start without DATABASE_URL", () => {
    const error = loadExpectingFailure({});
    expect(error.problems.some((p) => p.startsWith("DATABASE_URL"))).toBe(true);
  });

  it("never echoes a rejected value, which may be a secret", () => {
    const error = loadExpectingFailure({ DATABASE_URL: "mysql://user:hunter2-secret@host/db" });

    expect(error.message).toContain("DATABASE_URL");
    expect(error.message).not.toContain("hunter2-secret");
  });

  it("accepts only the literal strings true/false for flags", () => {
    expect(loadConfig({ DATABASE_URL: VALID_URL, LOG_PRETTY: "true" }).logging.pretty).toBe(true);
    for (const ambiguous of ["yes", "1", "TRUE", "on"]) {
      expect(() => loadConfig({ DATABASE_URL: VALID_URL, LOG_PRETTY: ambiguous })).toThrow(
        InvalidConfigError,
      );
    }
  });

  it("trusts a counted number of proxies, never every forwarded address", () => {
    expect(loadConfig({ DATABASE_URL: VALID_URL, TRUST_PROXY: "1" }).server.trustProxy).toBe(1);
    expect(loadConfig({ DATABASE_URL: VALID_URL, TRUST_PROXY: "false" }).server.trustProxy).toBe(
      false,
    );
    // `true` takes the left-most X-Forwarded-For entry, which the client writes.
    for (const unsafe of ["true", "0", "9", "yes"]) {
      expect(
        loadExpectingFailure({ DATABASE_URL: VALID_URL, TRUST_PROXY: unsafe }).problems,
      ).toEqual([expect.stringContaining("TRUST_PROXY")]);
    }
  });

  it("requires the web proxy's secret in production, and a long one anywhere", () => {
    expect(
      loadExpectingFailure({ DATABASE_URL: VALID_URL, NODE_ENV: "production" }).problems,
    ).toEqual([expect.stringContaining("PROXY_SHARED_SECRET")]);
    expect(
      loadExpectingFailure({ DATABASE_URL: VALID_URL, PROXY_SHARED_SECRET: "short" }).problems,
    ).toEqual([expect.stringContaining("PROXY_SHARED_SECRET")]);
    expect(loadConfig({ DATABASE_URL: VALID_URL, ...PRODUCTION }).proxy.sharedSecret).toBe(
      PROXY_SECRET,
    );
    expect(loadConfig({ DATABASE_URL: VALID_URL }).proxy.sharedSecret).toBeNull();
  });

  it("parses the CORS allowlist and drops blank entries", () => {
    const config = loadConfig({
      DATABASE_URL: VALID_URL,
      CORS_ALLOWED_ORIGINS: " https://a.example , ,https://b.example ",
    });
    expect(config.cors.allowedOrigins).toEqual(["https://a.example", "https://b.example"]);
  });

  it("disables API docs in production unless explicitly enabled", () => {
    expect(loadConfig({ DATABASE_URL: VALID_URL, ...PRODUCTION }).apiDocs.enabled).toBe(false);
    expect(loadConfig({ DATABASE_URL: VALID_URL, NODE_ENV: "development" }).apiDocs.enabled).toBe(
      true,
    );
    expect(
      loadConfig({ DATABASE_URL: VALID_URL, ...PRODUCTION, API_DOCS_ENABLED: "true" }).apiDocs
        .enabled,
    ).toBe(true);
  });

  it("uses the test AI provider outside production and none in production", () => {
    expect(loadConfig({ DATABASE_URL: VALID_URL }).ai).toEqual({
      provider: "fake",
      timeoutMs: 15_000,
      maxAttempts: 2,
    });
    expect(loadConfig({ DATABASE_URL: VALID_URL }).rateLimit.aiPerMinute).toBe(20);
    expect(loadConfig({ DATABASE_URL: VALID_URL, ...PRODUCTION }).ai.provider).toBeNull();
    expect(loadConfig({ DATABASE_URL: VALID_URL, AI_PROVIDER: "disabled" }).ai.provider).toBeNull();
  });

  it("refuses the test AI provider in production (OPEN_QUESTIONS #17)", () => {
    const error = loadExpectingFailure({
      DATABASE_URL: VALID_URL,
      ...PRODUCTION,
      AI_PROVIDER: "fake",
    });
    expect(error.problems).toEqual([expect.stringContaining("AI_PROVIDER")]);
  });

  it("bounds the AI timeout and attempts", () => {
    expect(
      loadExpectingFailure({ DATABASE_URL: VALID_URL, AI_MAX_ATTEMPTS: "0" }).problems,
    ).toEqual([expect.stringContaining("AI_MAX_ATTEMPTS")]);
    expect(loadExpectingFailure({ DATABASE_URL: VALID_URL, AI_TIMEOUT_MS: "5" }).problems).toEqual([
      expect.stringContaining("AI_TIMEOUT_MS"),
    ]);
  });
});
