/**
 * Admin calls for the question bank (API_CONTRACTS.md "Questions" and
 * "Question authoring context"). Routes require questions.* permissions on the
 * server; these types describe its responses and are not a second copy of its
 * rules. Admin responses carry the answer key — they never reach a student.
 */

import { api, type RichContent } from "./api";

export type { ContentBlock, RichContent } from "./api";

export type QuestionType = "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TRUE_FALSE";
export type QuestionVersionStatus =
  | "DRAFT"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "PUBLISHED"
  | "ARCHIVED";
export type MappingRole = "PRIMARY" | "SECONDARY";
export type ReviewDecision = "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";

export interface QuestionOption {
  key: string;
  content: RichContent;
  isCorrect: boolean;
  displayOrder: number;
}

export interface QuestionMapping {
  skillId: string | null;
  subskillId: string | null;
  role: MappingRole;
  attributionWeight: number;
  rationale: string | null;
}

export interface QuestionReview {
  reviewerId: string | null;
  decision: ReviewDecision;
  notes: string | null;
  createdAt: string;
}

export interface QuestionVersion {
  id: string;
  questionId: string;
  versionNumber: number;
  status: QuestionVersionStatus;
  questionType: QuestionType;
  stem: RichContent;
  explanation: RichContent | null;
  difficulty: number;
  taxonomyVersionId: string;
  /** A shared reading passage shown above the stem; null for most questions. */
  passageId: string | null;
  sourceType: string | null;
  sourceReference: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  options: QuestionOption[];
  mappings: QuestionMapping[];
  reviews: QuestionReview[];
}

export interface VersionSummary {
  id: string;
  versionNumber: number;
  status: QuestionVersionStatus;
  questionType: QuestionType;
  taxonomyVersionId: string;
  updatedAt: string;
}

export interface QuestionSummary {
  id: string;
  stableCode: string;
  archivedAt: string | null;
  createdAt: string;
  /** Newest first. */
  versions: VersionSummary[];
}

export interface QuestionListItem {
  id: string;
  stableCode: string;
  archivedAt: string | null;
  latestVersion: VersionSummary & { stemPreview: string };
}

export interface QuestionList {
  items: QuestionListItem[];
  page: { limit: number; offset: number; total: number };
}

export interface QuestionListFilters {
  limit: number;
  offset: number;
  status?: QuestionVersionStatus;
  taxonomyVersionId?: string;
}

/** The body the API takes for a draft's content (questions.dto.ts). */
export interface DraftContentInput {
  questionType: QuestionType;
  stem: RichContent;
  explanation?: RichContent;
  difficulty: number;
  taxonomyVersionId: string;
  passageId?: string | null;
  sourceType?: string;
  sourceReference?: string;
  options: { key: string; content: RichContent; isCorrect: boolean; displayOrder?: number }[];
  mappings: {
    skillId?: string;
    subskillId?: string;
    role: MappingRole;
    attributionWeight?: number;
    rationale?: string;
  }[];
}

/** One item of QUESTION_CONTENT_INVALID's details. */
export interface ContentProblem {
  path: string;
  message: string;
  rule?: string;
}

export interface AuthoringExam {
  exam: { id: string; code: string; nameAr: string; status: "DRAFT" | "ACTIVE" };
  versions: { id: string; versionCode: string; status: "DRAFT" | "PUBLISHED" }[];
}

export interface OutlineNode {
  id: string;
  code: string;
  name: string;
}

export interface TaxonomyOutline {
  version: {
    id: string;
    examId: string;
    versionCode: string;
    status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  };
  domains: (OutlineNode & { skills: (OutlineNode & { subskills: OutlineNode[] })[] })[];
}

/* ------------------------------- questions -------------------------------- */

export const listQuestions = (filters: QuestionListFilters) => {
  const query = new URLSearchParams({
    limit: String(filters.limit),
    offset: String(filters.offset),
  });
  if (filters.status) query.set("status", filters.status);
  if (filters.taxonomyVersionId) query.set("taxonomyVersionId", filters.taxonomyVersionId);
  return api<QuestionList>(`/admin/questions?${query}`);
};

export const createQuestion = (body: { stableCode?: string; content: DraftContentInput }) =>
  api<QuestionVersion>("/admin/questions", { method: "POST", body });

export const getQuestion = (questionId: string) =>
  api<QuestionSummary>(`/admin/questions/${questionId}`);

export const createNextVersion = (questionId: string) =>
  api<QuestionVersion>(`/admin/questions/${questionId}/versions`, { method: "POST" });

export const archiveQuestion = (questionId: string) =>
  api<void>(`/admin/questions/${questionId}/archive`, { method: "POST" });

/* -------------------------------- versions -------------------------------- */

export const getQuestionVersion = (versionId: string) =>
  api<QuestionVersion>(`/admin/question-versions/${versionId}`);

export const updateDraft = (versionId: string, content: DraftContentInput) =>
  api<QuestionVersion>(`/admin/question-versions/${versionId}`, { method: "PUT", body: content });

export const submitForReview = (versionId: string) =>
  api<void>(`/admin/question-versions/${versionId}/submit-review`, { method: "POST" });

export const reviewVersion = (
  versionId: string,
  body: { decision: ReviewDecision; notes?: string },
) => api<void>(`/admin/question-versions/${versionId}/reviews`, { method: "POST", body });

export const publishVersion = (versionId: string) =>
  api<void>(`/admin/question-versions/${versionId}/publish`, { method: "POST" });

/* --------------------------- authoring context ---------------------------- */

export const listAuthoringTaxonomies = () =>
  api<{ items: AuthoringExam[] }>("/admin/question-authoring/taxonomies");

export const getTaxonomyOutline = (taxonomyVersionId: string) =>
  api<TaxonomyOutline>(`/admin/question-authoring/taxonomy-versions/${taxonomyVersionId}/outline`);

/** An uploaded image or audio file of question content (API_CONTRACTS.md "Question assets"). */
export interface QuestionAsset {
  id: string;
  kind: "IMAGE" | "AUDIO";
  contentType: string;
  byteSize: number;
}

/** Uploads a file the browser picked; the API reads its type from the bytes. */
export const uploadQuestionAsset = (contentBase64: string) =>
  api<QuestionAsset>("/admin/question-assets", { method: "POST", body: { contentBase64 } });

/** The file's bytes as base64 (no data: prefix), for the JSON upload. */
export function readAsBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file."));
    reader.onload = () => {
      const url = String(reader.result);
      resolve(url.slice(url.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

/** A reading passage several questions share (API_CONTRACTS.md "Reading passages"). Never edited. */
export interface Passage {
  id: string;
  title: string;
  content: RichContent;
  createdAt: string;
}

export const createPassage = (body: { title: string; content: RichContent }) =>
  api<Passage>("/admin/passages", { method: "POST", body });

export const getPassage = (passageId: string) =>
  api<Passage>(`/admin/passages/${encodeURIComponent(passageId)}`);

export function listPassages(search: string) {
  const query = new URLSearchParams({ limit: "10" });
  if (search) query.set("search", search);
  return api<{ items: (Passage & { questionCount: number })[]; page: { hasMore: boolean } }>(
    `/admin/passages?${query}`,
  );
}
