import { fileURLToPath } from "node:url";

import { config } from "dotenv";
import postgres, { type TransactionSql } from "postgres";
import { expect } from "vitest";

/**
 * Integration-test database access.
 *
 * Every test body runs inside a transaction that is ALWAYS rolled back, so a
 * test can never leave rows behind — whichever database TEST_DATABASE_URL
 * points at (an isolated Postgres in CI, the shared dev database locally).
 */

config({ path: fileURLToPath(new URL("../../../../.env", import.meta.url)), quiet: true });

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error("TEST_DATABASE_URL is required to run database integration tests.");
}

export const testSql = postgres(url, { max: 2, onnotice: () => {} });

export type Tx = TransactionSql;

/** PostgreSQL SQLSTATE codes the schema's guards are expected to raise. */
export const SqlState = {
  uniqueViolation: "23505",
  checkViolation: "23514",
  restrictViolation: "23001",
} as const;

class RollbackSignal extends Error {}

export async function withRollback(body: (tx: Tx) => Promise<void>): Promise<void> {
  try {
    await testSql.begin(async (tx) => {
      await body(tx);
      throw new RollbackSignal();
    });
  } catch (error) {
    if (!(error instanceof RollbackSignal)) throw error;
  }
}

/** Returns the single row a statement produced, failing loudly if there is none. */
export function firstRow<T>(rows: readonly T[]): T {
  const [row] = rows;
  if (row === undefined) throw new Error("Expected the statement to return a row.");
  return row;
}

/**
 * Asserts that `statement` is rejected with `sqlState`. Runs inside a savepoint
 * so the surrounding transaction stays usable for the rest of the test.
 */
export async function expectRejected(
  tx: Tx,
  sqlState: string,
  statement: (sp: Tx) => Promise<unknown>,
): Promise<void> {
  let caught: unknown;
  try {
    await tx.savepoint(statement);
  } catch (error) {
    caught = error;
  }
  expect(caught, "statement was accepted — the invariant is not enforced").toBeDefined();
  expect((caught as { code?: string }).code).toBe(sqlState);
}
