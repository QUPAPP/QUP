/**
 * AI for students (API_CONTRACTS.md "AI for students"): personalised
 * explanations of a student's own mistakes and the study chat. Both are for
 * subscribers of the exam only.
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

export interface AiFeatures {
  /** What this deployment offers. */
  mistakeExplanations: boolean;
  studyChat: boolean;
  /** Whether the student's subscription covers the exam; null when no exam was given. */
  subscribed: boolean | null;
  /** Free study chat replies left before subscribing; null for a subscriber or without an exam. */
  freeChatMessagesLeft: number | null;
}

export const getAiFeatures = (examId?: string) =>
  api<AiFeatures>(examId ? `/me/ai-features?examId=${examId}` : "/me/ai-features");

export type ChatRole = "STUDENT" | "ASSISTANT";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
}

export interface ChatReply {
  messages: ChatMessage[];
  kind: "ANSWERED" | "OFF_TOPIC" | "REFUSED";
  /** Titles of the library entries the reply drew on. */
  sources: string[];
  /** Free replies left after this one; null for a subscriber. */
  freeRemaining: number | null;
}

/** Longest message the assistant accepts (the API refuses longer ones). */
export const CHAT_MESSAGE_MAX = 1000;

export const getChat = (examId: string) =>
  api<{ items: ChatMessage[] }>(`/exams/${examId}/ai-chat`);

export const sendChatMessage = (examId: string, message: string) =>
  api<ChatReply>(`/exams/${examId}/ai-chat`, { method: "POST", body: { message } });

export const clearChat = (examId: string) =>
  api<void>(`/exams/${examId}/ai-chat`, { method: "DELETE" });

export const explainMistake = (examId: string, questionVersionId: string) =>
  api<{ explanation: MistakeExplanation }>(
    `/exams/${examId}/mistakes/${questionVersionId}/ai-explanation`,
    { method: "POST" },
  );
