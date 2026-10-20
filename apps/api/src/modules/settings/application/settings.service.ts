import { Inject, Injectable } from "@nestjs/common";

import type { ActorContext } from "../../../common/actor.js";
import { SETTINGS_STORE, type SettingsStore } from "../domain/ports.js";
import {
  isSettingKey,
  parseSettingValue,
  SETTING_DEFINITIONS,
  SETTING_KEYS,
  type SettingKey,
  type SettingValue,
} from "../domain/setting-definitions.js";
import { SettingNotFound, SettingVersionConflict } from "../domain/settings.errors.js";
import type { SettingsReader } from "../settings.contract.js";

export interface SettingVersion {
  key: SettingKey;
  version: number;
  value: unknown;
  /** Null for version 0, the code default. */
  updatedAt: Date | null;
  updatedBy: string | null;
}

/**
 * Versioned settings: a save adds the next version, nothing is overwritten,
 * and version 0 is the code default (setting-definitions.ts). Readers that
 * record a version can always recompute with exactly that value.
 */
@Injectable()
export class SettingsService implements SettingsReader {
  constructor(@Inject(SETTINGS_STORE) private readonly store: SettingsStore) {}

  async list(): Promise<SettingVersion[]> {
    return Promise.all(SETTING_KEYS.map((key) => this.currentVersion(key)));
  }

  async history(key: string): Promise<SettingVersion[]> {
    const known = requireKey(key);
    const stored = await this.store.history(known);
    return [
      ...stored.map((row): SettingVersion => ({ ...row, key: known })),
      defaultVersion(known),
    ];
  }

  async update(
    key: string,
    expectedVersion: number,
    value: unknown,
    actor: ActorContext,
  ): Promise<SettingVersion> {
    const known = requireKey(key);
    const parsed = parseSettingValue(known, value);
    const current = await this.currentVersion(known);
    if (current.version !== expectedVersion) throw new SettingVersionConflict();

    const saved = await this.store.insertVersion(
      {
        key: known,
        version: current.version + 1,
        valueType: SETTING_DEFINITIONS[known].valueType,
        value: parsed,
        description: SETTING_DEFINITIONS[known].description,
      },
      actor,
    );
    return { ...saved, key: known };
  }

  async current<K extends SettingKey>(
    key: K,
  ): Promise<{ version: number; value: SettingValue<K> }> {
    const { version, value } = await this.currentVersion(key);
    return { version, value: value as SettingValue<K> };
  }

  async atVersion<K extends SettingKey>(key: K, version: number | null): Promise<SettingValue<K>> {
    if (version === null || version === 0) return SETTING_DEFINITIONS[key].defaultValue;
    const stored = await this.store.atVersion(key, version);
    // Versions are never deleted; a reference to a missing one is corrupt data.
    if (!stored) throw new Error(`Setting ${key} has no version ${version}.`);
    return stored.value as SettingValue<K>;
  }

  private async currentVersion(key: SettingKey): Promise<SettingVersion> {
    const stored = await this.store.latest(key);
    return stored ? { ...stored, key } : defaultVersion(key);
  }
}

function requireKey(key: string): SettingKey {
  if (!isSettingKey(key)) throw new SettingNotFound();
  return key;
}

function defaultVersion(key: SettingKey): SettingVersion {
  return {
    key,
    version: 0,
    value: SETTING_DEFINITIONS[key].defaultValue,
    updatedAt: null,
    updatedBy: null,
  };
}
