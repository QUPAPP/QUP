import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";

import * as schema from "./schema/index.js";

/**
 * Database access factory.
 *
 * Deliberately free of side effects: importing this package opens no
 * connection and reads no environment. The caller (the API's validated config,
 * or a script's env loader) supplies the URL and owns the lifecycle.
 */

export type Schema = typeof schema;
export type Database = PostgresJsDatabase<Schema>;

export interface DatabaseOptions {
  /** Maximum pooled connections. */
  maxConnections?: number;
  /** Seconds to wait for a new connection before failing. */
  connectTimeoutSeconds?: number;
}

export interface DatabaseHandle {
  db: Database;
  /** Raw postgres.js client, for health checks and hand-written SQL. */
  sql: Sql;
  close: () => Promise<void>;
}

const DEFAULT_MAX_CONNECTIONS = 10;
const DEFAULT_CONNECT_TIMEOUT_SECONDS = 10;

export function createConnection(url: string, options: DatabaseOptions = {}): Sql {
  return postgres(url, {
    max: options.maxConnections ?? DEFAULT_MAX_CONNECTIONS,
    connect_timeout: options.connectTimeoutSeconds ?? DEFAULT_CONNECT_TIMEOUT_SECONDS,
    onnotice: () => {},
  });
}

export function createDatabase(url: string, options: DatabaseOptions = {}): DatabaseHandle {
  const sql = createConnection(url, options);
  return {
    db: drizzle(sql, { schema }),
    sql,
    close: () => sql.end({ timeout: 5 }),
  };
}
