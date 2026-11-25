import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests of the critical student path (TESTING.md "E2E"). Both apps are
 * started here, against a throwaway local database only — e2e/global-setup.ts
 * refuses any other — and the demo exam is seeded into it.
 *
 *   QUP_E2E_DATABASE_URL=postgresql://qup:qup_test@127.0.0.1:55433/qup_db pnpm --filter @qup/web e2e
 *
 * The API must be built first (pnpm build).
 */

const API_PORT = 3100;
const WEB_PORT = 3101;
const PROXY_SECRET = "e2e-proxy-secret-0123456789abcdef0123456789abcdef";
const databaseUrl = process.env.QUP_E2E_DATABASE_URL ?? "";

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.spec.ts",
  globalSetup: "./e2e/global-setup.ts",
  // One student journey at a time: they share the seeded exam.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? "github" : "list",
  use: {
    // localhost, not 127.0.0.1: Next.js in development serves its scripts and live reload to localhost only.
    baseURL: `http://localhost:${WEB_PORT}`,
    locale: "ar-SA",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      command: "node ../api/dist/main.js",
      url: `http://127.0.0.1:${API_PORT}/health/ready`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        NODE_ENV: "test",
        HOST: "127.0.0.1",
        PORT: String(API_PORT),
        DATABASE_URL: databaseUrl,
        PROXY_SHARED_SECRET: PROXY_SECRET,
        SESSION_COOKIE_SECURE: "false",
        AI_PROVIDER: "fake",
        AUTH_RATE_LIMIT_PER_MINUTE: "1000",
        STORAGE_LOCAL_DIR: "../../var/e2e-storage",
      },
    },
    {
      // Development mode: production's CSP upgrades requests to https, which plain localhost has not.
      command: `pnpm exec next dev --port ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}/healthz`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        API_INTERNAL_URL: `http://127.0.0.1:${API_PORT}`,
        PROXY_SHARED_SECRET: PROXY_SECRET,
        WEB_TRUSTED_PROXY_HOPS: "0",
      },
    },
  ],
});
