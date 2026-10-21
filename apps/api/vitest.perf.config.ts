import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

/**
 * On-demand performance checks (`pnpm --filter @qup/api perf`), kept out of
 * `pnpm test`: they load the test database for longer and measure, not assert
 * behaviour.
 */
export default defineConfig({
  test: {
    include: ["test/perf/**/*.perf.ts"],
    environment: "node",
    testTimeout: 300_000,
    hookTimeout: 300_000,
    fileParallelism: false,
  },
  plugins: [swc.vite({ module: { type: "es6" } })],
});
