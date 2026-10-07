/**
 * Reading PostgreSQL errors through Drizzle.
 *
 * Drizzle wraps driver errors, so the PostgreSQL error (from postgres.js) may
 * be the thrown value itself or its `cause`. Repositories use this to turn
 * constraint and guard violations into typed domain errors instead of 500s.
 */

export const PgErrorCode = {
  uniqueViolation: "23505",
  foreignKeyViolation: "23503",
  checkViolation: "23514",
  /** Raised by the guard triggers in migrations 0001 and 0005. */
  restrictViolation: "23001",
} as const;

export interface PgErrorInfo {
  code: string;
  constraint: string | undefined;
}

export function pgErrorInfo(error: unknown): PgErrorInfo | undefined {
  for (const candidate of [error, (error as { cause?: unknown } | null)?.cause]) {
    if (typeof candidate !== "object" || candidate === null) continue;
    const { code, constraint_name } = candidate as { code?: unknown; constraint_name?: unknown };
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) {
      return {
        code,
        constraint: typeof constraint_name === "string" ? constraint_name : undefined,
      };
    }
  }
  return undefined;
}
