/**
 * Admin calls for versioned settings (API_CONTRACTS.md "Settings"). A save
 * carries the version it was read at; the API refuses a stale one.
 */

import { api } from "./api";

export const LEVELS_KEY = "assessment.preliminaryResult.levels";

export interface SettingView {
  key: string;
  description: string;
  valueType: string;
  /** 0 is the code default. */
  version: number;
  value: unknown;
  updatedAt: string | null;
  updatedBy: string | null;
}

export const listSettings = () => api<{ items: SettingView[] }>("/admin/settings");

export const listSettingVersions = (key: string) =>
  api<{ items: SettingView[] }>(`/admin/settings/${key}/versions`);

export const updateSetting = (key: string, body: { expectedVersion: number; value: unknown }) =>
  api<SettingView>(`/admin/settings/${key}`, { method: "PUT", body });
