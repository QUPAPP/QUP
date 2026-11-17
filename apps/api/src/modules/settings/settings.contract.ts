/**
 * Public read contract of the settings module (AGENTS.md §5). Other modules
 * read settings through this, never the table, so every reader agrees on
 * versions and defaults.
 */

import type { SettingKey, SettingValue } from "./domain/setting-definitions.js";

export type {
  AiFreeTrialValue,
  FullReassessmentGateValue,
  PreliminaryLevelsValue,
  SettingKey,
  StudyChatRulesValue,
} from "./domain/setting-definitions.js";
export {
  AI_FREE_TRIAL_KEY,
  DEFAULT_FULL_REASSESSMENT_GATE,
  DEFAULT_PRELIMINARY_LEVELS,
  FULL_REASSESSMENT_GATE_KEY,
  PRELIMINARY_LEVELS_KEY,
  STUDY_CHAT_RULES_KEY,
} from "./domain/setting-definitions.js";

export interface SettingsReader {
  /** The setting in effect now; version 0 means the code default. */
  current<K extends SettingKey>(key: K): Promise<{ version: number; value: SettingValue<K> }>;
  /** The value of a past version; null or 0 means the code default. */
  atVersion<K extends SettingKey>(key: K, version: number | null): Promise<SettingValue<K>>;
}

export const SETTINGS_READER = Symbol("SETTINGS_READER");
