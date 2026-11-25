import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * Prepares the database the browser tests run against: migrations, then the
 * demo exam (packages/db seed-demo). Refuses anything but a local database —
 * the repository's .env points at a shared development database, which these
 * tests must never write to.
 */
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

export default function globalSetup(): void {
  const url = process.env.QUP_E2E_DATABASE_URL;
  if (!url) {
    throw new Error(
      "Set QUP_E2E_DATABASE_URL to a throwaway local PostgreSQL (e.g. postgresql://qup:qup_test@127.0.0.1:55433/qup_db).",
    );
  }
  const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`Refusing to run browser tests against ${host}: local databases only.`);
  }
  const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: url, NODE_ENV: "development" };
  for (const script of ["db:migrate", "db:seed:demo"]) {
    execFileSync("pnpm", [script], { cwd: repositoryRoot, env, stdio: "inherit", shell: true });
  }
}
