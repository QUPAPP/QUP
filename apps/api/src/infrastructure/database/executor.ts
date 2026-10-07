import type { Database } from "@qup/db";

/** A Drizzle transaction handle, as passed to `db.transaction(async (tx) => …)`. */
export type DbTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Anything that can run queries: the pool or an open transaction. */
export type DbExecutor = Database | DbTransaction;
