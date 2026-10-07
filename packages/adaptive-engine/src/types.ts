/**
 * Mastery Engine data types. Plain data only: the engine has no knowledge of
 * databases, HTTP or LLMs (ADAPTIVE_ENGINE.md §23 "No DB/HTTP/LLM inside
 * calculation"; §21 the LLM never decides mastery).
 */

export type MasteryState =
  | "UNASSESSED"
  | "UNCERTAIN"
  | "GAP"
  | "DEVELOPING"
  | "READY_FOR_REASSESSMENT"
  | "MASTERED";

/** Per student + measurable learning node (§2). */
export interface NodeMastery {
  alpha: number;
  beta: number;
  masteryScore: number;
  confidenceScore: number;
  evidenceCount: number;
  distinctQuestionCount: number;
  coverageScore: number;
  state: MasteryState;
}

/** The node's own settings from the taxonomy. */
export interface NodeSettings {
  /** Null → the config default (§12). */
  masteryThreshold: number | null;
  /** Distinct questions needed for full coverage (OPEN_QUESTIONS.md #12b). */
  minCoverage: number;
}

export type AttemptResult =
  | { kind: "ANSWERED"; isCorrect: boolean; hintUsed: boolean; answerRevealed: boolean }
  | { kind: "SKIPPED" }
  | { kind: "TIMEOUT" };

/** An attempt eligible to produce evidence, with what the engine needs to weigh it. */
export interface EligibleAttempt {
  attemptId: string;
  /** The logical question (not the version): repeats are counted per question. */
  questionId: string;
  result: AttemptResult;
  /** Normalized 0..1 (§4). */
  difficulty: number;
  answeredAt: Date;
  /** When this student last answered the same question, or null the first time (§9). */
  previousAttemptAt: Date | null;
}

export interface LearningNodeMapping {
  role: "PRIMARY" | "SECONDARY";
  /** Stored on the mapping; defaults were applied when the question was written (§7). */
  attributionWeight: number;
}

export type EvidenceReason = "CORRECT" | "CORRECT_WITH_HINT" | "INCORRECT" | "TIMEOUT";

/** Immutable record of one evidence application (§22, mastery_events). */
export interface MasteryEventDraft {
  attemptId: string;
  beforeMastery: number;
  afterMastery: number;
  beforeConfidence: number;
  afterConfidence: number;
  positiveEvidence: number;
  negativeEvidence: number;
  reasonCode: EvidenceReason;
  difficulty: number;
  attributionWeight: number;
  algorithmVersion: string;
  configVersion: string;
}
