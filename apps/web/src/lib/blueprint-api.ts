/**
 * Admin calls for diagnostic blueprints (API_CONTRACTS.md "Blueprints"). Which
 * blueprint is live, and what may change, is decided by the API.
 */

import { api } from "./api";
import { DIAGNOSTIC_TITLES } from "./diagnostics";

export type BlueprintStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

/** The sessions a blueprint plans: the two diagnostics and the timed mock exam. */
export type BlueprintType = "MINI_DIAGNOSTIC" | "FULL_DIAGNOSTIC" | "MOCK_EXAM";

export const BLUEPRINT_TYPE_TITLES: Record<BlueprintType, string> = {
  ...DIAGNOSTIC_TITLES,
  MOCK_EXAM: "الاختبار المحاكي",
};

export interface BlueprintSummary {
  id: string;
  examId: string;
  taxonomyVersionId: string;
  type: BlueprintType;
  code: string;
  name: string;
  questionCount: number;
  /** Mock exam only: one clock for the whole exam; null keeps the per-question default. */
  timeLimitMinutes: number | null;
  status: BlueprintStatus;
  createdAt: string;
  updatedAt: string;
}

export interface BlueprintDomain {
  id: string;
  name: string;
  taxonomyWeight: number;
  /** Null: the domain keeps its taxonomy weight. */
  weight: number | null;
}

export interface Blueprint extends Omit<BlueprintSummary, "taxonomyVersionId"> {
  taxonomyVersion: { id: string; versionCode: string; status: string };
  domains: BlueprintDomain[];
}

export interface BlueprintUpdate {
  name?: string;
  questionCount?: number;
  timeLimitMinutes?: number | null;
  domainWeights?: { domainId: string; weight: number | null }[];
}

export const listBlueprints = (examId: string) =>
  api<{ items: BlueprintSummary[] }>(`/admin/exams/${examId}/blueprints`);

export const createBlueprint = (
  examId: string,
  body: {
    type: BlueprintType;
    code: string;
    name: string;
    questionCount: number;
    timeLimitMinutes?: number | null;
  },
) => api<Blueprint>(`/admin/exams/${examId}/blueprints`, { method: "POST", body });

export const getBlueprint = (blueprintId: string) =>
  api<Blueprint>(`/admin/blueprints/${blueprintId}`);

export const updateBlueprint = (blueprintId: string, body: BlueprintUpdate) =>
  api<Blueprint>(`/admin/blueprints/${blueprintId}`, { method: "PATCH", body });

export const activateBlueprint = (blueprintId: string) =>
  api<Blueprint>(`/admin/blueprints/${blueprintId}/activate`, { method: "POST" });

export const archiveBlueprint = (blueprintId: string) =>
  api<Blueprint>(`/admin/blueprints/${blueprintId}/archive`, { method: "POST" });
