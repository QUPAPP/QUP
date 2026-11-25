/**
 * Admin calls for versioned settings (API_CONTRACTS.md "Settings"). A save
 * carries the version it was read at; the API refuses a stale one.
 */

import { api } from "./api";

export const LEVELS_KEY = "assessment.preliminaryResult.levels";
/** The full re-diagnostic's gate (PRD §8). */
export const GATE_KEY = "assessment.fullReassessment.gate";
/** The study chat's extra rules (AI_INTEGRATION.md "Study Chat"). */
export const CHAT_RULES_KEY = "ai.studyChat.rules";
/** Free study chat replies before subscribing. */
export const FREE_TRIAL_KEY = "ai.freeTrial";
/** The platform-wide AI ceiling over 24 hours. */
export const AI_BUDGET_KEY = "ai.dailyBudget";

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
