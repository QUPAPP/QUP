import { describe, expect, it } from "vitest";

import { disabledFeatures, InvalidConfigError, loadConfig } from "../src/config/app-config.js";

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

  it("needs the public address in production once email is on, for the links inside emails", () => {
    const email = {
      DATABASE_URL: VALID_URL,
      ...PRODUCTION,
      SNDR_API_KEY: "key",
      SNDR_FROM: "QUP <no-reply@qupedu.com>",
      OTP_SECRET: "an-otp-secret-that-is-long-enough-12345",
    };
    expect(loadExpectingFailure(email).problems).toEqual([
      expect.stringContaining("APP_PUBLIC_URL"),
    ]);
    expect(loadConfig({ ...email, APP_PUBLIC_URL: "https://qupedu.com/" }).email.appUrl).toBe(
      "https://qupedu.com",
    );
  });

  it("names every feature a deployment leaves off, and the variables that turn it on", () => {
    const bare = disabledFeatures(loadConfig({ DATABASE_URL: VALID_URL, ...PRODUCTION }));
    expect(bare).toHaveLength(4);
    expect(bare.join()).toContain("STREAM_API_KEY");
    expect(bare.join()).toContain("SNDR_API_KEY");
    expect(bare.join()).toContain("AI_PROVIDER=deepseek");
    expect(bare.join()).toContain("STORAGE_DRIVER=s3");
    const withAi = loadConfig({
      DATABASE_URL: VALID_URL,
      ...PRODUCTION,
      AI_PROVIDER: "deepseek",
      AI_API_KEY: "sk-test",
    });
    expect(disabledFeatures(withAi).join()).not.toContain("AI is off");
  });

  it("stores files in an S3 bucket when told to, and needs its credentials", () => {
    const s3 = loadConfig({
      DATABASE_URL: VALID_URL,
      STORAGE_DRIVER: "s3",
      S3_BUCKET: "qup-assets",
      S3_ACCESS_KEY_ID: "key",
      S3_SECRET_ACCESS_KEY: "secret",
      S3_ENDPOINT: "https://example.r2.cloudflarestorage.com",
    });
    expect(s3.storage).toMatchObject({ driver: "s3", bucket: "qup-assets", region: "auto" });
    expect(() =>
      loadConfig({ DATABASE_URL: VALID_URL, STORAGE_DRIVER: "s3", S3_BUCKET: "b" }),
    ).toThrow(/S3_ACCESS_KEY_ID/);
    // The variable that once held only import files still names the local directory.
    expect(loadConfig({ DATABASE_URL: VALID_URL, IMPORT_STORAGE_DIR: "var/old" }).storage).toEqual({
      driver: "local",
      directory: "var/old",
    });
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
      provider: { kind: "fake" },
      studentExplanations: true,
      studyChat: true,
      timeoutMs: 15_000,
      maxAttempts: 2,
    });
    expect(loadConfig({ DATABASE_URL: VALID_URL }).rateLimit.aiPerMinute).toBe(20);
    expect(loadConfig({ DATABASE_URL: VALID_URL, ...PRODUCTION }).ai.provider).toBeNull();
    expect(loadConfig({ DATABASE_URL: VALID_URL, AI_PROVIDER: "disabled" }).ai.provider).toBeNull();
  });

  it("runs Claude when asked, with a key, on the configured model and effort", () => {
    const config = loadConfig({
      DATABASE_URL: VALID_URL,
      ...PRODUCTION,
      AI_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "sk-ant-test-key",
      AI_EFFORT: "low",
    });
    expect(config.ai.provider).toEqual({
      kind: "anthropic",
      apiKey: "sk-ant-test-key",
      model: "claude-opus-5-5",
      effort: "low",
    });
    // Free for every student by default (OPEN_QUESTIONS.md #18); the flag can still hide it.
    expect(config.ai.studentExplanations).toBe(true);
    expect(
      loadConfig({ DATABASE_URL: VALID_URL, AI_STUDENT_EXPLANATIONS: "false" }).ai
        .studentExplanations,
    ).toBe(false);
  });

  it("gives a real model more time per attempt than the test provider", () => {
    const claude = loadConfig({
      DATABASE_URL: VALID_URL,
      AI_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "sk-ant-test-key",
    });
    expect(claude.ai.timeoutMs).toBe(45_000);
    expect(
      loadConfig({
        DATABASE_URL: VALID_URL,
        AI_PROVIDER: "anthropic",
        AI_API_KEY: "sk-ant-test-key",
        AI_TIMEOUT_MS: "20000",
      }).ai,
    ).toMatchObject({
      provider: { kind: "anthropic", apiKey: "sk-ant-test-key" },
      timeoutMs: 20_000,
    });
  });

  it("runs Grok and other OpenAI-compatible providers at their public address", () => {
    expect(
      loadConfig({
        DATABASE_URL: VALID_URL,
        ...PRODUCTION,
        AI_PROVIDER: "grok",
        AI_API_KEY: "xai-test-key",
        AI_MODEL: "grok-test-model",
      }).ai.provider,
    ).toEqual({
      kind: "openai-compatible",
      name: "grok",
      baseUrl: "https://api.x.ai/v1",
      apiKey: "xai-test-key",
      model: "grok-test-model",
      jsonMode: false,
      thinkingOff: null,
    });
    expect(
      loadConfig({
        DATABASE_URL: VALID_URL,
        ...PRODUCTION,
        AI_PROVIDER: "deepseek",
        AI_API_KEY: "sk-deepseek-test",
      }).ai.provider,
    ).toEqual({
      kind: "openai-compatible",
      name: "deepseek",
      baseUrl: "https://api.deepseek.com/v1",
      apiKey: "sk-deepseek-test",
      model: "deepseek-flash",
      jsonMode: true,
      thinkingOff: { thinking: { type: "disabled" } },
    });
    expect(
      loadConfig({
        DATABASE_URL: VALID_URL,
        ...PRODUCTION,
        AI_PROVIDER: "openrouter",
        AI_API_KEY: "sk-or-test",
        AI_MODEL: "deepseek/deepseek-v4.1-flash-1017",
      }).ai.provider,
    ).toEqual({
      kind: "openai-compatible",
      name: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "sk-or-test",
      model: "deepseek/deepseek-v4.1-flash-1017",
      jsonMode: true,
      thinkingOff: { reasoning: { effort: "none" } },
    });
    expect(
      loadConfig({
        DATABASE_URL: VALID_URL,
        AI_PROVIDER: "openai-compatible",
        AI_BASE_URL: "http://localhost:11434/v1",
        AI_MODEL: "llama-test",
      }).ai.provider,
    ).toMatchObject({
      name: "openai-compatible",
      baseUrl: "http://localhost:11434/v1",
      apiKey: "",
      thinkingOff: null,
    });
  });

  it("refuses an OpenAI-compatible provider without its key, model or address", () => {
    expect(loadExpectingFailure({ DATABASE_URL: VALID_URL, AI_PROVIDER: "grok" }).problems).toEqual(
      [expect.stringMatching(/^AI_API_KEY/), expect.stringMatching(/^AI_MODEL/)],
    );
    expect(
      loadExpectingFailure({
        DATABASE_URL: VALID_URL,
        AI_PROVIDER: "openai-compatible",
        AI_MODEL: "m",
      }).problems,
    ).toEqual([expect.stringMatching(/^AI_BASE_URL/)]);
  });

  it("refuses Claude without an API key, naming the variable only", () => {
    const error = loadExpectingFailure({ DATABASE_URL: VALID_URL, AI_PROVIDER: "anthropic" });
    expect(error.problems.some((p) => p.startsWith("ANTHROPIC_API_KEY"))).toBe(true);
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
