/**
 * Public read contract of the settings module (AGENTS.md §5). Other modules
 * read settings through this, never the table, so every reader agrees on
 * versions and defaults.
 */

import type { SettingKey, SettingValue } from "./domain/setting-definitions.js";

export type { PreliminaryLevelsValue, SettingKey } from "./domain/setting-definitions.js";
export { PRELIMINARY_LEVELS_KEY } from "./domain/setting-definitions.js";

export interface SettingsReader {
  /** The setting in effect now; version 0 means the code default. */
  current<K extends SettingKey>(key: K): Promise<{ version: number; value: SettingValue<K> }>;
  /** The value of a past version; null or 0 means the code default. */
  atVersion<K extends SettingKey>(key: K, version: number | null): Promise<SettingValue<K>>;
}

export const SETTINGS_READER = Symbol("SETTINGS_READER");
