import { defineConfig } from "drizzle-kit";

import { env } from "./src/env.js";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dbCredentials: { url: env.DATABASE_URL },
  strict: true,
  verbose: true,
});
