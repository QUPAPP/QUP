import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

import { createConnection } from "./client.js";
import { describeTarget } from "./env.js";

/**
 * Applies committed migrations to the database named by DATABASE_URL.
 *
 * Guard: refuses to run unless the target identifies itself as the QUP
 * database. A baseline applied to the wrong database is not recoverable by
 * re-running it, so the check happens before any DDL is sent.
 *
 * Never resets or drops on failure — a failed migration is diagnosed and fixed
 * forward (AGENTS.md §7).
 */

const EXPECTED_DATABASE = "qup_db";

const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));

async function main(): Promise<void> {
  const connection = createConnection({ max: 1 });

  try {
    const [target] = await connection<{ database: string }[]>`
      SELECT current_database() AS database
    `;

    if (target?.database !== EXPECTED_DATABASE) {
      throw new Error(
        `Refusing to migrate: connected to "${target?.database}", expected "${EXPECTED_DATABASE}".`,
      );
    }

    console.log(`Migrating ${describeTarget()} …`);
    await migrate(drizzle(connection), { migrationsFolder });
    console.log("Migrations applied.");
  } finally {
    await connection.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
