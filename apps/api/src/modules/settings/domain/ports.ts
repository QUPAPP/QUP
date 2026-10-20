import type { ActorContext } from "../../../common/actor.js";

/** One stored version of a setting. Version 0 is never stored: it is the code default. */
export interface StoredSetting {
  key: string;
  version: number;
  value: unknown;
  updatedAt: Date;
  updatedBy: string | null;
}

export interface SettingsStore {
  latest(key: string): Promise<StoredSetting | null>;
  atVersion(key: string, version: number): Promise<StoredSetting | null>;
  /** Stored versions, newest first. */
  history(key: string): Promise<StoredSetting[]>;
  /**
   * Inserts the given version and its audit entry atomically. Throws
   * SettingVersionConflict when that version already exists (a concurrent save).
   */
  insertVersion(
    input: {
      key: string;
      version: number;
      valueType: "JSON";
      value: unknown;
      description: string;
    },
    actor: ActorContext,
  ): Promise<StoredSetting>;
}

export const SETTINGS_STORE = Symbol("SETTINGS_STORE");
