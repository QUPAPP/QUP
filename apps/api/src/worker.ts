import "reflect-metadata";

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";

import { InvalidConfigError, loadConfig } from "./config/app-config.js";
import { OutboxRelay } from "./infrastructure/outbox/outbox-relay.js";
import { WorkerModule } from "./worker/worker.module.js";

// Local development convenience only, as in main.ts.
const localEnvFile = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(localEnvFile)) process.loadEnvFile(localEnvFile);

/** Drains the outbox until SIGTERM / SIGINT, then finishes the current batch and exits. */
async function run(): Promise<void> {
  const config = loadConfig(process.env);
  const context = await NestFactory.createApplicationContext(WorkerModule.forRoot(config), {
    bufferLogs: true,
  });
  context.useLogger(context.get(Logger));
  context.enableShutdownHooks();

  const stop = new AbortController();
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => stop.abort());
  }
  await context.get(OutboxRelay).run(stop.signal);
  await context.close();
}

run().catch((error: unknown) => {
  console.error(error instanceof InvalidConfigError ? error.message : error);
  process.exit(1);
});
