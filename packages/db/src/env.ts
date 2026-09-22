import { fileURLToPath } from "node:url";

import { config } from "dotenv";
import { z } from "zod";

// Repo-root .env (gitignored). Connection details never live in source.
// fileURLToPath, not URL.pathname: the latter yields "/C:/..." on Windows.
config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .refine((value) => value.startsWith("postgresql://") || value.startsWith("postgres://"), {
      message: "DATABASE_URL must be a PostgreSQL connection string",
    }),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map(
    (issue) => `  - ${issue.path.join(".")}: ${issue.message}`,
  );
  throw new Error(`Invalid database environment:\n${issues.join("\n")}`);
}

export const env = parsed.data;

/** Host:port/database only — safe to log. Never includes credentials. */
export function describeTarget(): string {
  const url = new URL(env.DATABASE_URL);
  return `${url.hostname}:${url.port}${url.pathname}`;
}
