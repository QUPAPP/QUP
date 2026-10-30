import { Inject, Injectable } from "@nestjs/common";
import { type Database, tables } from "@qup/db";
import { eq, inArray } from "drizzle-orm";

import { DATABASE } from "../../../infrastructure/database/database.module.js";
import type { DirectoryEntry, UserDirectory } from "../auth.contract.js";
import { parseSignInIdentifier } from "../domain/identifiers.js";

@Injectable()
export class DrizzleUserDirectory implements UserDirectory {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async describe(userIds: readonly string[]) {
    if (userIds.length === 0) return new Map();
    const rows = await this.db
      .select({
        id: tables.users.id,
        email: tables.users.email,
        displayName: tables.users.displayName,
      })
      .from(tables.users)
      .where(inArray(tables.users.id, [...userIds]));
    return new Map(rows.map((row) => [row.id, { email: row.email, displayName: row.displayName }]));
  }

  async findByIdentifier(identifier: string): Promise<DirectoryEntry | null> {
    const parsed = parseSignInIdentifier(identifier);
    if (!parsed) return null;
    const column = parsed.kind === "email" ? tables.users.email : tables.users.phone;
    const [row] = await this.db
      .select({
        id: tables.users.id,
        email: tables.users.email,
        phone: tables.users.phone,
        displayName: tables.users.displayName,
      })
      .from(tables.users)
      .where(eq(column, parsed.value))
      .limit(1);
    return row ?? null;
  }
}
