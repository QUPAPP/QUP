/**
 * Personalised explanations of a student's own mistakes (API_CONTRACTS.md
 * "AI for students"). Off unless the deployment turns it on.
 */

import { api } from "./api";

export type ErrorType =
  | "CONCEPTUAL_ERROR"
  | "CALCULATION_ERROR"
  | "MISREAD_QUESTION"
  | "PREREQUISITE_GAP"
  | "UNKNOWN";

export interface MistakeExplanation {
  errorType: ErrorType;
  explanation: string;
  tip: string;
  cached: boolean;
}

/** How each error type reads to a student; UNKNOWN shows no label. */
export const ERROR_TYPE_LABELS: Record<ErrorType, string | null> = {
  CONCEPTUAL_ERROR: "خطأ في فهم المفهوم",
  CALCULATION_ERROR: "خطأ في الحساب",
  MISREAD_QUESTION: "قراءة غير دقيقة للسؤال",
  PREREQUISITE_GAP: "مهارة سابقة تحتاج مراجعة",
  UNKNOWN: null,
};

export const getAiFeatures = () => api<{ mistakeExplanations: boolean }>("/me/ai-features");

export const explainMistake = (examId: string, questionVersionId: string) =>
  api<{ explanation: MistakeExplanation }>(
    `/exams/${examId}/mistakes/${questionVersionId}/ai-explanation`,
    { method: "POST" },
  );
