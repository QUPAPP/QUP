/**
 * Admin calls for exams and taxonomy (API_CONTRACTS.md "Exams — Admin" and
 * "Taxonomy"). Every route requires taxonomy.manage on the server; these
 * types describe its responses and are not a second copy of its rules.
 */

import { api } from "./api";

export type ExamStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type VersionStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type NodeStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type NodeType = "domain" | "skill" | "subskill";

export interface AdminExam {
  id: string;
  code: string;
  slug: string;
  nameAr: string;
  nameEn: string | null;
  description: string | null;
  status: ExamStatus;
  createdAt: string;
}

export interface TaxonomyVersion {
  id: string;
  examId: string;
  versionCode: string;
  status: VersionStatus;
  effectiveFrom: string | null;
  createdAt: string;
}

export interface SubskillNode {
  id: string;
  code: string;
  name: string;
  description: string | null;
  weight: number;
  /** A share in (0, 1]; null falls back to the versioned config default. */
  masteryThreshold: number | null;
  displayOrder: number;
  status: NodeStatus;
}

export interface SkillNode extends SubskillNode {
  priorityWeight: number;
  minCoverage: number;
  prerequisites: { prerequisiteSkillId: string; importanceWeight: number }[];
  subskills: SubskillNode[];
}

export interface DomainNode {
  id: string;
  code: string;
  name: string;
  description: string | null;
  weight: number;
  displayOrder: number;
  status: NodeStatus;
  skills: SkillNode[];
}

export interface TaxonomyTree {
  version: TaxonomyVersion;
  domains: DomainNode[];
}

export interface CreateExamInput {
  code: string;
  slug: string;
  nameAr: string;
  nameEn?: string;
  description?: string;
}

export interface UpdateExamInput {
  nameAr?: string;
  nameEn?: string | null;
  description?: string | null;
  status?: ExamStatus;
}

export interface CreateVersionInput {
  versionCode: string;
  effectiveFrom?: string;
}

interface NodeFields {
  code: string;
  name: string;
  description?: string;
  weight?: number;
  displayOrder?: number;
}

export interface CreateDomainInput extends NodeFields {
  taxonomyVersionId: string;
}

export interface CreateSkillInput extends NodeFields {
  domainId: string;
  masteryThreshold?: number;
  priorityWeight?: number;
  minCoverage?: number;
}

export interface CreateSubskillInput extends NodeFields {
  skillId: string;
  masteryThreshold?: number;
}

export interface DomainChanges {
  name?: string;
  description?: string | null;
  weight?: number;
  displayOrder?: number;
}

export interface SubskillChanges extends DomainChanges {
  masteryThreshold?: number | null;
}

export interface SkillChanges extends SubskillChanges {
  priorityWeight?: number;
  minCoverage?: number;
}

export interface AddPrerequisiteInput {
  prerequisiteSkillId: string;
  importanceWeight?: number;
}

/* --------------------------------- exams ---------------------------------- */

export const listAdminExams = () => api<{ items: AdminExam[] }>("/admin/exams");

export const createExam = (body: CreateExamInput) =>
  api<AdminExam>("/admin/exams", { method: "POST", body });

export const updateExam = (examId: string, body: UpdateExamInput) =>
  api<AdminExam>(`/admin/exams/${examId}`, { method: "PATCH", body });

/* ------------------------------- versions --------------------------------- */

export const listTaxonomyVersions = (examId: string) =>
  api<{ items: TaxonomyVersion[] }>(`/admin/exams/${examId}/taxonomy-versions`);

export const createTaxonomyVersion = (examId: string, body: CreateVersionInput) =>
  api<TaxonomyVersion>(`/admin/exams/${examId}/taxonomy-versions`, { method: "POST", body });

export const getTaxonomyTree = (versionId: string) =>
  api<TaxonomyTree>(`/admin/taxonomy-versions/${versionId}/tree`);

export const publishTaxonomyVersion = (versionId: string) =>
  api<TaxonomyVersion>(`/admin/taxonomy-versions/${versionId}/publish`, { method: "POST" });

/* --------------------------------- nodes ---------------------------------- */

export const createDomain = (body: CreateDomainInput) =>
  api<{ id: string }>("/admin/domains", { method: "POST", body });

export const createSkill = (body: CreateSkillInput) =>
  api<{ id: string }>("/admin/skills", { method: "POST", body });

export const createSubskill = (body: CreateSubskillInput) =>
  api<{ id: string }>("/admin/subskills", { method: "POST", body });

export const updateDomain = (domainId: string, body: DomainChanges) =>
  api<void>(`/admin/domains/${domainId}`, { method: "PATCH", body });

export const updateSkill = (skillId: string, body: SkillChanges) =>
  api<void>(`/admin/skills/${skillId}`, { method: "PATCH", body });

export const updateSubskill = (subskillId: string, body: SubskillChanges) =>
  api<void>(`/admin/subskills/${subskillId}`, { method: "PATCH", body });

export const archiveNode = (type: NodeType, nodeId: string) =>
  api<void>(`/admin/nodes/${type}/${nodeId}/archive`, { method: "POST" });

export const addPrerequisite = (skillId: string, body: AddPrerequisiteInput) =>
  api<void>(`/admin/skills/${skillId}/prerequisites`, { method: "POST", body });

export const removePrerequisite = (skillId: string, prerequisiteSkillId: string) =>
  api<void>(`/admin/skills/${skillId}/prerequisites/${prerequisiteSkillId}`, {
    method: "DELETE",
  });
