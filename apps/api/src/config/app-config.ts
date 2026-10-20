import { z } from "zod";

/**
 * Application configuration, validated once at startup.
 *
 * The process refuses to boot on invalid configuration (fail fast at the
 * boundary, AGENTS.md §3). Error messages name the offending variables but
 * never echo their values, which may be secrets.
 */

/** Only the literal strings "true"/"false" — no silent coercion of "1", "yes", etc. */
const booleanFlag = z.enum(["true", "false"]).transform((value) => value === "true");

const commaSeparatedList = z.string().transform((value) =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0),
);

const MAX_TCP_PORT = 65_535;
const ONE_MEBIBYTE = 1_048_576;
/** 90 days. Longer-lived sessions widen the window for a stolen cookie. */
const MAX_SESSION_TTL_HOURS = 2_160;
const ONE_DAY_IN_MINUTES = 1_440;
/** Below this an AI call cannot answer at all; above it an author gives up waiting. */
const MIN_AI_TIMEOUT_MS = 100;
const MAX_AI_TIMEOUT_MS = 120_000;
const MAX_AI_ATTEMPTS = 5;

/** Empty strings in a .env file mean "not set". */
const optionalSecret = z
  .string()
  .optional()
  .transform((value) => (value && value.length > 0 ? value : undefined));

const optionalUrl = z
  .string()
  .optional()
  .transform((value) => (value && value.length > 0 ? value : undefined))
  .refine((value) => value === undefined || URL.canParse(value), "must be a URL");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(MAX_TCP_PORT).default(3000),

  DATABASE_URL: z
    .string()
    .min(1, "is required")
    .refine((value) => /^postgres(ql)?:\/\//.test(value), "must be a PostgreSQL connection string"),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  LOG_PRETTY: booleanFlag.default(false),

  /** Browser origins allowed to call the API. Empty means no cross-origin access. */
  CORS_ALLOWED_ORIGINS: commaSeparatedList.default([]),
  /** Trust X-Forwarded-* headers. Enable only behind a known reverse proxy. */
  TRUST_PROXY: booleanFlag.default(false),
  /**
   * Maximum JSON body size. File uploads belong in object storage; the one
   * exception is the structured-import upload (≤ 2 MiB), which has its own
   * route limit until object storage exists (OPEN_QUESTIONS.md #16g).
   */
  BODY_LIMIT_BYTES: z.coerce.number().int().min(1).default(ONE_MEBIBYTE),
  /** Serve the generated OpenAPI document. Defaults to off in production. */
  API_DOCS_ENABLED: booleanFlag.optional(),

  /** Absolute session lifetime. Sessions are not extended by activity. */
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(MAX_SESSION_TTL_HOURS).default(720),
  /** Secure (HTTPS-only) session cookie. Defaults to on in production. */
  SESSION_COOKIE_SECURE: booleanFlag.optional(),

  /** Per-IP request budget per minute across the whole API. */
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(300),
  /** Per-IP budget per minute for credential endpoints (login, register). */
  AUTH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(10),
  /** Per-IP budget per minute for AI assistance calls, which cost money once a real provider runs. */
  AI_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(20),

  /**
   * Stream (streampay.sa). Leave both unset to run without online payment:
   * plans, entitlements and admin grants still work; checkout answers 503.
   */
  STREAM_API_KEY: optionalSecret,
  STREAM_WEBHOOK_SECRET: optionalSecret,
  STREAM_API_BASE_URL: z.url().default("https://stream-app-service.streampay.sa"),
  /** Pages Stream sends the payer to afterwards. Never proof of payment. */
  PAYMENT_SUCCESS_URL: optionalUrl,
  PAYMENT_FAILURE_URL: optionalUrl,
  /** How long a checkout link accepts payment. */
  CHECKOUT_TTL_MINUTES: z.coerce.number().int().min(5).max(ONE_DAY_IN_MINUTES).default(60),

  /** Private directory for uploaded import files (V1 storage adapter). Relative to the working directory. */
  IMPORT_STORAGE_DIR: z.string().min(1).default("var/imports"),

  /**
   * AI assistance for authors (AI_INTEGRATION.md). `fake` is the deterministic
   * test provider; real providers wait for OPEN_QUESTIONS.md #17. Defaults to
   * `fake` outside production and `disabled` in production.
   */
  AI_PROVIDER: z.enum(["fake", "disabled"]).optional(),
  /** Per attempt; the attempt is aborted when it runs out. */
  AI_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(MIN_AI_TIMEOUT_MS)
    .max(MAX_AI_TIMEOUT_MS)
    .default(15_000),
  /** Attempts for output that is not valid JSON, breaks the schema or fails its check. */
  AI_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(MAX_AI_ATTEMPTS).default(2),
});

/** Checks that span several variables. Messages name variables, never values. */
function crossFieldProblems(env: z.infer<typeof envSchema>): string[] {
  const problems: string[] = [];
  if ((env.STREAM_API_KEY === undefined) !== (env.STREAM_WEBHOOK_SECRET === undefined)) {
    problems.push("STREAM_API_KEY and STREAM_WEBHOOK_SECRET: set both, or neither");
  }
  // The API key travels on every request to this URL: plain HTTP is for local fakes only.
  if (env.NODE_ENV === "production" && !env.STREAM_API_BASE_URL.startsWith("https://")) {
    problems.push("STREAM_API_BASE_URL: must use https in production");
  }
  // Canned suggestions would reach real authors as if a model wrote them.
  if (env.NODE_ENV === "production" && env.AI_PROVIDER === "fake") {
    problems.push("AI_PROVIDER: the fake provider is for development and tests only");
  }
  return problems;
}

export type AppConfig = ReturnType<typeof toAppConfig>;

function toAppConfig(env: z.infer<typeof envSchema>) {
  return {
    environment: env.NODE_ENV,
    isProduction: env.NODE_ENV === "production",
    server: {
      host: env.HOST,
      port: env.PORT,
      trustProxy: env.TRUST_PROXY,
      bodyLimitBytes: env.BODY_LIMIT_BYTES,
    },
    database: {
      url: env.DATABASE_URL,
      poolMax: env.DATABASE_POOL_MAX,
    },
    logging: {
      level: env.LOG_LEVEL,
      pretty: env.LOG_PRETTY,
    },
    cors: {
      allowedOrigins: env.CORS_ALLOWED_ORIGINS,
    },
    apiDocs: {
      enabled: env.API_DOCS_ENABLED ?? env.NODE_ENV !== "production",
    },
    session: {
      ttlHours: env.SESSION_TTL_HOURS,
      secureCookie: env.SESSION_COOKIE_SECURE ?? env.NODE_ENV === "production",
    },
    rateLimit: {
      perMinute: env.RATE_LIMIT_PER_MINUTE,
      authPerMinute: env.AUTH_RATE_LIMIT_PER_MINUTE,
      aiPerMinute: env.AI_RATE_LIMIT_PER_MINUTE,
    },
    payments: {
      stream:
        env.STREAM_API_KEY !== undefined && env.STREAM_WEBHOOK_SECRET !== undefined
          ? {
              apiKey: env.STREAM_API_KEY,
              webhookSecret: env.STREAM_WEBHOOK_SECRET,
              baseUrl: env.STREAM_API_BASE_URL,
            }
          : null,
      successUrl: env.PAYMENT_SUCCESS_URL ?? null,
      failureUrl: env.PAYMENT_FAILURE_URL ?? null,
      checkoutTtlMinutes: env.CHECKOUT_TTL_MINUTES,
    },
    imports: {
      storageDir: env.IMPORT_STORAGE_DIR,
    },
    ai: {
      /** null: AI is off and its routes answer AI_UNAVAILABLE. */
      provider:
        (env.AI_PROVIDER ?? (env.NODE_ENV === "production" ? "disabled" : "fake")) === "fake"
          ? ("fake" as const)
          : null,
      timeoutMs: env.AI_TIMEOUT_MS,
      maxAttempts: env.AI_MAX_ATTEMPTS,
    },
  } as const;
}

export class InvalidConfigError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Invalid configuration:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "InvalidConfigError";
  }
}

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new InvalidConfigError(
      parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    );
  }
  const problems = crossFieldProblems(parsed.data);
  if (problems.length > 0) throw new InvalidConfigError(problems);
  return toAppConfig(parsed.data);
}

/** DI token for the validated configuration. */
export const APP_CONFIG = Symbol("APP_CONFIG");
