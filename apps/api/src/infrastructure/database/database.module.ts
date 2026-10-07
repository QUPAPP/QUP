import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from "@nestjs/common";
import { createDatabase, type Database, type DatabaseHandle } from "@qup/db";

import { APP_CONFIG, type AppConfig } from "../../config/app-config.js";

/** Drizzle instance for repositories. */
export const DATABASE = Symbol("DATABASE");

/** Narrow port for readiness checks — health code needs `ping`, not a query builder. */
export const DATABASE_HEALTH = Symbol("DATABASE_HEALTH");

export interface DatabaseHealth {
  /** Resolves when the database answers within `timeoutMs`; rejects otherwise. */
  ping(timeoutMs: number): Promise<void>;
}

const DATABASE_HANDLE = Symbol("DATABASE_HANDLE");

export class DatabasePingTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Database did not respond within ${timeoutMs} ms.`);
    this.name = "DatabasePingTimeoutError";
  }
}

function pingWithTimeout(handle: DatabaseHandle, timeoutMs: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DatabasePingTimeoutError(timeoutMs)), timeoutMs);
  });
  const query = handle.sql`SELECT 1`.then(() => undefined);
  return Promise.race([query, timeout]).finally(() => clearTimeout(timer));
}

@Injectable()
class DatabaseLifecycle implements OnApplicationShutdown {
  constructor(@Inject(DATABASE_HANDLE) private readonly handle: DatabaseHandle) {}

  async onApplicationShutdown(): Promise<void> {
    await this.handle.close();
  }
}

/**
 * Owns the single connection pool for the process. postgres.js connects
 * lazily, so creating the pool does not touch the network until first use.
 */
@Global()
@Module({
  providers: [
    {
      provide: DATABASE_HANDLE,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): DatabaseHandle =>
        createDatabase(config.database.url, { maxConnections: config.database.poolMax }),
    },
    {
      provide: DATABASE,
      inject: [DATABASE_HANDLE],
      useFactory: (handle: DatabaseHandle): Database => handle.db,
    },
    {
      provide: DATABASE_HEALTH,
      inject: [DATABASE_HANDLE],
      useFactory: (handle: DatabaseHandle): DatabaseHealth => ({
        ping: (timeoutMs) => pingWithTimeout(handle, timeoutMs),
      }),
    },
    DatabaseLifecycle,
  ],
  exports: [DATABASE, DATABASE_HEALTH],
})
export class DatabaseModule {}
