import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "./env.js";
import * as schema from "./schema/index.js";

export function createConnection(options: { max?: number } = {}) {
  return postgres(env.DATABASE_URL, {
    max: options.max ?? 10,
    onnotice: () => {},
  });
}

export const sql = createConnection();
export const db = drizzle(sql, { schema });

export { schema };
