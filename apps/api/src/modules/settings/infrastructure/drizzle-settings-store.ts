import { Inject, Injectable } from "@nestjs/common";
import { type Database, tables } from "@qup/db";
import { and, desc, eq } from "drizzle-orm";

import type { ActorContext } from "../../../common/actor.js";
import { AuditAction, writeAudit } from "../../../infrastructure/audit/audit-log.js";
import { DATABASE } from "../../../infrastructure/database/database.module.js";
import { PgErrorCode, pgErrorInfo } from "../../../infrastructure/database/postgres-errors.js";
import type { SettingsStore, StoredSetting } from "../domain/ports.js";
import { SettingVersionConflict } from "../domain/settings.errors.js";

const { systemSettings } = tables;

const columns = {
  key: systemSettings.key,
  version: systemSettings.version,
  value: systemSettings.value,
  updatedAt: systemSettings.updatedAt,
  updatedBy: systemSettings.updatedBy,
};

@Injectable()
export class DrizzleSettingsStore implements SettingsStore {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async latest(key: string): Promise<StoredSetting | null> {
    const [row] = await this.db
      .select(columns)
      .from(systemSettings)
      .where(eq(systemSettings.key, key))
      .orderBy(desc(systemSettings.version))
      .limit(1);
    return row ?? null;
  }

  async atVersion(key: string, version: number): Promise<StoredSetting | null> {
    const [row] = await this.db
      .select(columns)
      .from(systemSettings)
      .where(and(eq(systemSettings.key, key), eq(systemSettings.version, version)));
    return row ?? null;
  }

  history(key: string): Promise<StoredSetting[]> {
    return this.db
      .select(columns)
      .from(systemSettings)
      .where(eq(systemSettings.key, key))
      .orderBy(desc(systemSettings.version));
  }

  async insertVersion(
    input: { key: string; version: number; valueType: "JSON"; value: unknown; description: string },
    actor: ActorContext,
  ): Promise<StoredSetting> {
    try {
      return await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(systemSettings)
          .values({ ...input, updatedBy: actor.userId })
          .returning(columns);
        if (!row) throw new Error("Setting insert returned no row.");
        await writeAudit(tx, actor, {
          action: AuditAction.SettingUpdated,
          resourceType: "setting",
          resourceId: input.key,
          metadata: { version: input.version },
        });
        return row;
      });
    } catch (error) {
      // (key, version) is unique: another save took this version first.
      if (pgErrorInfo(error)?.code === PgErrorCode.uniqueViolation)
        throw new SettingVersionConflict();
      throw error;
    }
  }
}
