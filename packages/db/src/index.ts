// Public surface of @qup/db. Importing it has no side effects: no connection is
// opened and no environment is read. Scripts (migrate, verify) load env
// themselves via ./env.ts, which is intentionally not exported.
export {
  createConnection,
  createDatabase,
  type Database,
  type DatabaseHandle,
  type DatabaseOptions,
  type Schema,
} from "./client.js";
export * as tables from "./schema/index.js";
