/**
 * Browser-side client for the QUP API, through this app's same-origin proxy.
 *
 * The types here describe what the API returns (API_CONTRACTS.md); they are
 * not a second copy of its rules. Anything that decides something — grading,
 * levels, access, prices — is decided by the server and only displayed here.
 */

const API_PREFIX = "/api/v1";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    /** Stable code from the API's error envelope. */
    readonly code: string,
    message: string,
    readonly details: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  /** Required by the API on answer, skip and checkout; a retry must reuse it. */
  idempotencyKey?: string;
}

const NO_CONTENT = 204;

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${API_PREFIX}${path}`, {
    method: options.method ?? "GET",
    headers: {
      accept: "application/json",
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...(options.idempotencyKey ? { "idempotency-key": options.idempotencyKey } : {}),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    credentials: "same-origin",
    cache: "no-store",
  });

  if (response.status === NO_CONTENT) return undefined as T;
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw toApiError(response.status, payload);
  return payload as T;
}

function toApiError(status: number, payload: unknown): ApiError {
  const error = (payload as { error?: { code?: unknown; message?: unknown; details?: unknown } })
    ?.error;
  return new ApiError(
    status,
    typeof error?.code === "string" ? error.code : "UNKNOWN",
    typeof error?.message === "string" ? error.message : "Request failed.",
    error?.details,
  );
}

export const isApiError = (error: unknown, code?: string): error is ApiError =>
  error instanceof ApiError && (code === undefined || error.code === code);

/* ------------------------------ response types ----------------------------- */

export interface User {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
}

export interface Exam {
  id: string;
  code: string;
  nameAr: string;
  description: string | null;
}

export type SessionStatus = "CREATED" | "IN_PROGRESS" | "COMPLETED" | "ABANDONED" | "EXPIRED";
export type SessionType =
  | "MINI_DIAGNOSTIC"
  | "FULL_DIAGNOSTIC"
  | "PRACTICE"
  | "ADAPTIVE_TRAINING"
  | "SKILL_REASSESSMENT"
  | "FULL_REASSESSMENT"
  | "MOCK_EXAM";

export interface AssessmentSession {
  id: string;
  examId: string;
  type: SessionType;
  status: SessionStatus;
  progress?: { answered: number; total: number };
}

export interface SessionHistoryEntry extends AssessmentSession {
  exam: { id: string; nameAr: string };
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  progress: { answered: number; total: number };
}

export interface SessionHistory {
  items: SessionHistoryEntry[];
  page: { limit: number; offset: number; hasMore: boolean };
}

export interface SessionHistoryFilters {
  limit: number;
  offset: number;
  examId?: string;
  status?: SessionStatus;
}

export type ContentBlock = { type: "text"; text: string } | { type: "math"; latex: string };
export interface RichContent {
  blocks: ContentBlock[];
}

export interface CurrentItem {
  item: {
    id: string;
    ordinal: number;
    question: {
      questionType: "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TRUE_FALSE";
      stem: RichContent;
      options: { key: string; content: RichContent }[];
    };
  } | null;
  progress: { answered: number; total: number };
}

export interface SubmitResult {
  result: { isCorrect: boolean | null };
  progress: { answered: number; total: number };
  next: { type: "QUESTION" | "COMPLETED" };
}

interface Labelled {
  code: string;
  label: string;
}

export interface PreliminaryResult {
  score: { correct: number; total: number; percentage: number };
  level: Labelled;
  strengths: { skill: string; rating: Labelled }[];
  weaknesses: { skill: string; rating: Labelled }[];
  nextStep: { type: "SUBSCRIBE"; message: string } | null;
}

export interface Money {
  amountMinor: number;
  currency: string;
}

export interface PlanOffer {
  id: string;
  name: string;
  price: Money;
  durationDays: number | null;
}

export interface Payment {
  id: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED" | "REFUNDED" | "CANCELLED";
  amount: Money;
  checkoutUrl: string | null;
}

export interface ExamAccess {
  examId: string;
  hasAccess: boolean;
  activeUntil: string | null;
}

/* --------------------------------- calls ---------------------------------- */

export const getMe = () => api<{ user: User }>("/auth/me");

export const login = (body: { identifier: string; password: string }) =>
  api<{ user: User }>("/auth/login", { method: "POST", body });

export const register = (body: {
  email?: string;
  phone?: string;
  password: string;
  displayName?: string;
}) => api<{ user: User }>("/auth/register", { method: "POST", body });

export const logout = () => api<void>("/auth/logout", { method: "POST" });

export const listExams = () => api<{ items: Exam[] }>("/exams");

export const listAssessmentHistory = (filters: SessionHistoryFilters) => {
  const query = new URLSearchParams({
    limit: String(filters.limit),
    offset: String(filters.offset),
  });
  if (filters.examId) query.set("examId", filters.examId);
  if (filters.status) query.set("status", filters.status);
  return api<SessionHistory>(`/assessments?${query}`);
};

export const startMiniDiagnostic = (examId: string) =>
  api<AssessmentSession>(`/exams/${examId}/assessments/mini-diagnostic`, { method: "POST" });

export const getSession = (sessionId: string) =>
  api<AssessmentSession>(`/assessments/${sessionId}`);

export const startSession = (sessionId: string) =>
  api<AssessmentSession>(`/assessments/${sessionId}/start`, { method: "POST" });

export const getCurrentItem = (sessionId: string) =>
  api<CurrentItem>(`/assessments/${sessionId}/current-item`);

export const submitAnswer = (
  sessionId: string,
  itemId: string,
  optionKeys: string[],
  idempotencyKey: string,
  multiple: boolean,
) =>
  api<SubmitResult>(`/assessments/${sessionId}/items/${itemId}/answer`, {
    method: "POST",
    idempotencyKey,
    body: { answer: multiple ? { optionKeys } : { optionKey: optionKeys[0] } },
  });

export const skipItem = (sessionId: string, itemId: string, idempotencyKey: string) =>
  api<SubmitResult>(`/assessments/${sessionId}/items/${itemId}/skip`, {
    method: "POST",
    idempotencyKey,
  });

export const getResult = (sessionId: string) =>
  api<PreliminaryResult>(`/assessments/${sessionId}/result`);

export const listPlans = (examId: string) => api<{ items: PlanOffer[] }>(`/exams/${examId}/plans`);

export const checkout = (planId: string, idempotencyKey: string) =>
  api<Payment>("/payments", { method: "POST", idempotencyKey, body: { planId } });

export const getPayment = (paymentId: string) => api<Payment>(`/payments/${paymentId}`);

export const getExamAccess = (examId: string) => api<ExamAccess>(`/exams/${examId}/my-access`);

export const revokeOtherSessions = () => api<void>("/auth/sessions/revoke", { method: "POST" });
