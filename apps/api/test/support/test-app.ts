import "reflect-metadata";

import { Writable } from "node:stream";

import type { Type } from "@nestjs/common";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";

import { AppModule } from "../../src/app.module.js";
import { configureApp, createAdapter, NEST_APP_OPTIONS } from "../../src/bootstrap/create-app.js";
import { type AppConfig, loadConfig } from "../../src/config/app-config.js";
import {
  DATABASE_HEALTH,
  type DatabaseHealth,
} from "../../src/infrastructure/database/database.module.js";

/**
 * Builds the real application — same module graph, same adapter, same
 * configureApp — with two seams: the database health port and the log sink.
 * postgres.js connects lazily, so the placeholder DATABASE_URL is never dialled.
 */

export const TEST_ALLOWED_ORIGIN = "https://app.qup.test";
export const TEST_BODY_LIMIT_BYTES = 1024;

export function testConfig(overrides: Record<string, string> = {}): AppConfig {
  return loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://placeholder:placeholder@127.0.0.1:1/never_connected",
    LOG_LEVEL: "info",
    CORS_ALLOWED_ORIGINS: TEST_ALLOWED_ORIGIN,
    BODY_LIMIT_BYTES: String(TEST_BODY_LIMIT_BYTES),
    ...overrides,
  });
}

export class LogCapture extends Writable {
  private readonly chunks: string[] = [];

  override _write(chunk: Buffer, _encoding: BufferEncoding, done: () => void): void {
    this.chunks.push(chunk.toString("utf8"));
    done();
  }

  get text(): string {
    return this.chunks.join("");
  }
}

export interface TestApp {
  app: NestFastifyApplication;
  logs: LogCapture;
}

export async function buildTestApp(
  options: {
    databaseHealth?: DatabaseHealth;
    controllers?: Type[];
    config?: AppConfig;
    /** Providers replaced by test doubles, e.g. a scripted AI provider. */
    overrides?: { provide: string | symbol | Type; useValue: unknown }[];
  } = {},
): Promise<TestApp> {
  const config = options.config ?? testConfig();
  const logs = new LogCapture();
  const healthy: DatabaseHealth = { ping: async () => {} };

  let builder = Test.createTestingModule({
    imports: [AppModule.forRoot(config, { logDestination: logs })],
    controllers: options.controllers ?? [],
  })
    .overrideProvider(DATABASE_HEALTH)
    .useValue(options.databaseHealth ?? healthy);
  for (const { provide, useValue } of options.overrides ?? []) {
    builder = builder.overrideProvider(provide).useValue(useValue);
  }
  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(createAdapter(config), {
    bufferLogs: true,
    ...NEST_APP_OPTIONS,
  });
  await configureApp(app, config);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return { app, logs };
}
