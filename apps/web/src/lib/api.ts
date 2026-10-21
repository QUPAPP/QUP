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
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
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

/**
 * The signed-in account. Permissions only decide what the interface offers;
 * the API checks them again on every call.
 */
export interface Me {
  user: User;
  roles: string[];
  permissions: string[];
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
    /** Training: the skill this question was chosen for. */
    target?: { skillName: string };
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
  /** Training only, after the answer is stored. */
  review?: AnswerReview;
}

export interface AnswerReview {
  correctOptionKeys: string[];
  explanation: RichContent | null;
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

export type MasteryState =
  | "UNASSESSED"
  | "UNCERTAIN"
  | "GAP"
  | "DEVELOPING"
  | "READY_FOR_REASSESSMENT"
  | "MASTERED";

export interface ProfileNode {
  id: string;
  name: string;
  state: MasteryState;
  /** Null until measured: the API never reports the prior as a level. */
  mastery: number | null;
  coverage: number;
  evidenceCount: number;
}

export interface SkillProfile {
  exam: { id: string; nameAr: string };
  summary: {
    skills: number;
    assessed: number;
    gaps: number;
    readyForReassessment: number;
    mastered: number;
  };
  domains: {
    id: string;
    name: string;
    skills: (ProfileNode & {
      gapSeverity: number | null;
      /** Set while a failed reassessment holds the skill. */
      reassessment: { remainingAttempts: number } | null;
      subskills: ProfileNode[];
    })[];
  }[];
  gaps: {
    skillId: string;
    skillName: string;
    domainName: string;
    state: MasteryState;
    severity: number;
  }[];
}

/* --------------------------------- calls ---------------------------------- */

export const getMe = () => api<Me>("/auth/me");

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

export const startFullDiagnostic = (examId: string) =>
  api<AssessmentSession>(`/exams/${examId}/assessments/full-diagnostic`, { method: "POST" });

/** API_CONTRACTS.md "Full re-diagnostic"; the gate is the server's (PRD §8). */
export interface FullReassessmentStatus {
  state: "OPEN" | "REQUIRES_ACCESS" | "FULL_DIAGNOSTIC_REQUIRED" | "WAITING" | "ELIGIBLE";
  openSessionId: string | null;
  lastMeasuredAt: string | null;
  availableAt: string | null;
  trainingAttempts: { done: number; required: number };
  cooldownDays: number;
}

export interface FullReassessmentResult {
  score: { correct: number; total: number };
  previous: {
    type: SessionType;
    completedAt: string;
    correct: number;
    total: number;
  } | null;
  skills: {
    skillId: string;
    name: string;
    correct: number;
    total: number;
    previousCorrect: number | null;
    previousTotal: number | null;
  }[];
}

export const getFullReassessmentStatus = (examId: string) =>
  api<FullReassessmentStatus>(`/exams/${examId}/full-reassessment`);

export const startFullReassessment = (examId: string) =>
  api<AssessmentSession>(`/exams/${examId}/assessments/full-reassessment`, { method: "POST" });

export const getFullReassessmentResult = (sessionId: string) =>
  api<FullReassessmentResult>(`/assessments/${sessionId}/full-reassessment-result`);

/** The server's choice of the student's next learning action in one exam (OPEN_QUESTIONS.md #12f). */
export type NextStep =
  | { type: "RESUME_SESSION"; sessionId: string; sessionType: SessionType }
  | { type: "START_MINI_DIAGNOSTIC" }
  | { type: "SUBSCRIBE" }
  | { type: "START_FULL_DIAGNOSTIC" }
  | { type: "REASSESS"; skillId: string; skillName: string }
  | { type: "START_FULL_REASSESSMENT" }
  | { type: "TRAIN"; skillName: string | null }
  | { type: "ALL_MASTERED" };

export interface ExamProgress {
  exam: { id: string; nameAr: string };
  hasAccess: boolean;
  nextStep: NextStep;
  /** Paid only. */
  standing: {
    summary: SkillProfile["summary"];
    strengths: { skillName: string; state: MasteryState; mastery: number }[];
    gaps: { skillName: string; severity: number }[];
    improvements: { nodeName: string; before: number; after: number }[];
  } | null;
}

export const getDashboard = () => api<{ exams: ExamProgress[] }>("/me/dashboard");

export interface ReassessmentResult {
  skill: { id: string; name: string };
  passed: boolean;
  correct: number;
  total: number;
  requiredCorrect: number;
  /** Answers still needed before a retry; null after a pass. */
  remainingAttempts: number | null;
}

export const startReassessment = (examId: string, skillId: string) =>
  api<AssessmentSession>(`/exams/${examId}/skills/${skillId}/reassessment`, { method: "POST" });

export const getReassessmentResult = (sessionId: string) =>
  api<ReassessmentResult>(`/assessments/${sessionId}/reassessment-result`);

export const startTraining = (examId: string) =>
  api<AssessmentSession>(`/exams/${examId}/assessments/training`, { method: "POST" });

/** Ends a training session early; a diagnostic only once every item is answered. */
export const completeSession = (sessionId: string) =>
  api<AssessmentSession>(`/assessments/${sessionId}/complete`, { method: "POST" });

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

export const getSkillProfile = (examId: string) =>
  api<SkillProfile>(`/exams/${examId}/skill-profile`);
