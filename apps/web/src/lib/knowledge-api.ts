/**
 * The AI knowledge library (API_CONTRACTS.md "AI Knowledge Library"): model
 * questions that question generation imitates, and reference texts the study
 * chat is grounded on, per exam.
 */

import { api } from "./api";

export type KnowledgeKind = "EXAMPLE" | "REFERENCE";

export interface KnowledgeItem {
  id: string;
  examId: string;
  skillId: string | null;
  kind: KnowledgeKind;
  title: string;
  content: string;
  chunkCount: number;
  createdBy: string | null;
  createdAt: string;
}

export interface NewKnowledgeItem {
  taxonomyVersionId: string;
  nodeId: string | null;
  kind: KnowledgeKind;
  title: string;
  content: string;
}

export const KNOWLEDGE_TITLE_MAX = 200;
export const KNOWLEDGE_CONTENT_MAX = 20_000;

export const KNOWLEDGE_KIND_LABELS: Record<KnowledgeKind, string> = {
  EXAMPLE: "نموذج أسئلة",
  REFERENCE: "مرجع وشرح",
};

export const KNOWLEDGE_KIND_HINTS: Record<KnowledgeKind, string> = {
  EXAMPLE: "أسئلة أو اختبار كامل يقلّد التوليد أسلوبه وصياغته وطوله، دون نسخ محتواه.",
  REFERENCE: "ملخص أو شرح يستند إليه المساعد الدراسي حين يجيب الطلاب.",
};

export const listKnowledge = (filter: { examId: string | null; limit: number; offset: number }) => {
  const query = new URLSearchParams({ limit: String(filter.limit), offset: String(filter.offset) });
  if (filter.examId) query.set("examId", filter.examId);
  return api<{
    items: KnowledgeItem[];
    page: { limit: number; offset: number; hasMore: boolean };
  }>(`/admin/ai/knowledge?${query.toString()}`);
};

export const addKnowledge = (body: NewKnowledgeItem) =>
  api<{ item: KnowledgeItem }>("/admin/ai/knowledge", { method: "POST", body });

export const archiveKnowledge = (id: string) =>
  api<void>(`/admin/ai/knowledge/${id}/archive`, { method: "POST" });

/** File types read as plain text in the browser; anything else is pasted by hand. */
export const KNOWLEDGE_FILE_ACCEPT = ".txt,.md,.csv,text/plain,text/markdown,text/csv";
