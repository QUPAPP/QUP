export type SessionType =
  | "MINI_DIAGNOSTIC"
  | "FULL_DIAGNOSTIC"
  | "PRACTICE"
  | "ADAPTIVE_TRAINING"
  | "SKILL_REASSESSMENT"
  | "FULL_REASSESSMENT"
  | "MOCK_EXAM";

export type SessionStatus = "CREATED" | "IN_PROGRESS" | "COMPLETED" | "ABANDONED" | "EXPIRED";

export interface Session {
  id: string;
  studentId: string;
  examId: string;
  type: SessionType;
  status: SessionStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

export interface SessionProgress {
  total: number;
  /** Items with a finalized attempt, answered or skipped. */
  finalized: number;
}

export interface SessionHistoryQuery {
  examId?: string;
  status?: SessionStatus;
  limit: number;
  offset: number;
}

export interface SessionHistoryEntry {
  session: Session;
  progress: SessionProgress;
}

export interface SessionItem {
  id: string;
  ordinal: number;
  questionVersionId: string;
  presentedAt: Date | null;
  attempt: {
    id: string;
    resultType: "ANSWERED" | "SKIPPED" | "TIMEOUT";
    isCorrect: boolean | null;
  } | null;
}

export interface StoredAttempt {
  id: string;
  assessmentItemId: string;
  studentId: string;
  isCorrect: boolean | null;
  resultType: "ANSWERED" | "SKIPPED" | "TIMEOUT";
}

/** The outcome the service computed; the store persists it. */
export type AttemptOutcome =
  | { kind: "ANSWERED"; chosenKeys: string[]; isCorrect: boolean }
  | { kind: "SKIPPED" };

/** One learning node the question measures, with what the Mastery Engine needs. */
export interface EvidenceTarget {
  skillId: string | null;
  subskillId: string | null;
  role: "PRIMARY" | "SECONDARY";
  attributionWeight: number;
  masteryThreshold: number | null;
  minCoverage: number;
}

export interface RecordAttemptCommand {
  sessionId: string;
  examId: string;
  itemId: string;
  studentId: string;
  idempotencyKey: string;
  outcome: AttemptOutcome;
  responseTimeMs: number | null;
  /**
   * Mastery evidence to apply in the same transaction as the attempt
   * (ARCHITECTURE.md §7–§8): the attempt and its evidence commit together, or
   * neither does. The store supplies the transaction time and when the
   * student last answered the same logical question (repeat factor, §9).
   */
  evidence: {
    questionId: string;
    /** All versions of the question: a repeat is the same question, whatever the version. */
    questionVersionIds: readonly string[];
    difficulty: number;
    targets: readonly EvidenceTarget[];
  };
}

export type RecordAttemptResult =
  | { kind: "RECORDED"; attempt: StoredAttempt; progress: SessionProgress; completed: boolean }
  /** Same Idempotency-Key, same item: the earlier result, unchanged. */
  | { kind: "REPLAYED"; attempt: StoredAttempt; progress: SessionProgress; completed: boolean };

export interface PlannedSessionItem {
  questionVersionId: string;
}

export interface AssessmentStore {
  /** Caller-owned sessions, newest first with id as a stable tie-breaker. */
  history(
    studentId: string,
    query: SessionHistoryQuery,
  ): Promise<{ items: SessionHistoryEntry[]; hasMore: boolean }>;
  findSession(sessionId: string): Promise<Session | null>;
  /** Newest first. */
  sessionsFor(studentId: string, examId: string, type: SessionType): Promise<Session[]>;
  /** Items in order, each with its attempt if finalized. */
  items(sessionId: string): Promise<SessionItem[]>;
  progress(sessionId: string): Promise<SessionProgress>;
  /** Question versions the student has already been given in this exam (any session). */
  askedQuestionVersionIds(studentId: string, examId: string): Promise<string[]>;
  /** The exam's active MINI_DIAGNOSTIC blueprint size, if an admin configured one. */
  miniDiagnosticSize(examId: string): Promise<number | null>;

  /**
   * Creates the session with its items. When another request opened a session
   * of the same type concurrently, returns that one instead (unique index).
   */
  createSession(input: {
    studentId: string;
    examId: string;
    type: SessionType;
    scoringVersion: string;
    items: readonly PlannedSessionItem[];
  }): Promise<{ session: Session; created: boolean }>;
  /** CREATED → IN_PROGRESS; no-op when already in progress. */
  start(sessionId: string): Promise<Session>;
  markPresented(itemId: string): Promise<void>;
  findAttemptByIdempotencyKey(key: string): Promise<StoredAttempt | null>;
  recordAttempt(command: RecordAttemptCommand): Promise<RecordAttemptResult>;
  /** IN_PROGRESS → COMPLETED when every item is finalized. */
  complete(sessionId: string): Promise<Session>;
}

export const ASSESSMENT_STORE = Symbol("ASSESSMENT_STORE");
