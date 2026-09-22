import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createConnection } from "./client.js";
import { describeTarget } from "./env.js";

/**
 * Read-only check that the live database matches the committed migrations.
 *
 * Expectations are derived from drizzle's own migration metadata (journal and
 * latest snapshot), so this script stays correct as migrations are added.
 * Behavioural guarantees — uniqueness, CHECKs, triggers — are proven by the
 * integration tests in `test/`, not here.
 */

const migrationsDir = new URL("../migrations/", import.meta.url);

interface Journal {
  entries: { idx: number; tag: string }[];
}

interface Snapshot {
  tables: Record<string, { name: string; foreignKeys: Record<string, unknown> }>;
  enums: Record<string, { name: string; values: string[] }>;
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(fileURLToPath(new URL(relativePath, migrationsDir)), "utf8")) as T;
}

/** Triggers created by 0001_db_guards; a missing one means a guard is silently off. */
const EXPECTED_GUARD_TRIGGERS = [
  "mastery_events_append_only",
  "mastery_events_no_truncate",
  "audit_logs_append_only",
  "audit_logs_no_truncate",
  "question_versions_freeze",
  "question_options_freeze",
  "question_skill_mappings_freeze",
] as const;

let failures = 0;

function report(ok: boolean, label: string, detail = ""): void {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
}

async function main(): Promise<void> {
  const journal = readJson<Journal>("meta/_journal.json");
  const latest = journal.entries.at(-1);
  if (!latest) throw new Error("Migration journal is empty.");
  const snapshot = readJson<Snapshot>(`meta/${String(latest.idx).padStart(4, "0")}_snapshot.json`);

  const expectedTables = Object.values(snapshot.tables).map((t) => t.name);
  const expectedForeignKeys = Object.values(snapshot.tables).reduce(
    (sum, t) => sum + Object.keys(t.foreignKeys).length,
    0,
  );

  const sql = createConnection({ max: 1 });
  console.log(`Verifying ${describeTarget()} against ${latest.tag}\n`);

  try {
    const [applied] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`;
    report(
      applied?.n === journal.entries.length,
      "migrations applied",
      `${applied?.n} of ${journal.entries.length}`,
    );

    const tables = await sql<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`;
    const present = new Set(tables.map((t) => t.table_name));
    const missing = expectedTables.filter((t) => !present.has(t));
    report(
      missing.length === 0,
      "tables",
      missing.length ? `missing: ${missing.join(", ")}` : `${expectedTables.length} present`,
    );

    for (const { name, values } of Object.values(snapshot.enums)) {
      const rows = await sql<{ label: string }[]>`
        SELECT e.enumlabel AS label FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = ${name} ORDER BY e.enumsortorder`;
      const actual = rows.map((r) => r.label);
      report(JSON.stringify(actual) === JSON.stringify(values), `enum ${name}`);
    }

    const [fk] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_constraint c
      JOIN pg_namespace ns ON ns.oid = c.connamespace
      WHERE ns.nspname = 'public' AND c.contype = 'f'`;
    report(fk?.n === expectedForeignKeys, "foreign keys", `${fk?.n} of ${expectedForeignKeys}`);

    const triggers = await sql<{ tgname: string }[]>`
      SELECT tgname FROM pg_trigger WHERE NOT tgisinternal`;
    const triggerNames = new Set(triggers.map((t) => t.tgname));
    for (const name of EXPECTED_GUARD_TRIGGERS) {
      report(triggerNames.has(name), `guard trigger ${name}`);
    }
  } finally {
    await sql.end();
  }

  console.log(`\n${failures === 0 ? "SCHEMA MATCHES MIGRATIONS" : `${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
