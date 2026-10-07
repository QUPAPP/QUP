import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // End-to-end tests hash passwords with Argon2 and may talk to a remote
    // development database, so single tests can take several seconds.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // E2E files share one database; serial files keep failures deterministic.
    fileParallelism: false,
  },
  plugins: [
    // Vite's default transform drops decorator metadata, which Nest's DI needs.
    // Module type is set explicitly so SWC emits ESM rather than CommonJS.
    swc.vite({ module: { type: "es6" } }),
  ],
});
