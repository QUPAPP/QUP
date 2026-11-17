import type { RichContent } from "../questions/questions.contract.js";

/**
 * Public read contract of assessments for other modules (AGENTS.md §5).
 * Owned here: ai → assessments, never back.
 */

/** A student's latest wrong training answer on one question, with its answer key (server only). */
export interface StudentMistake {
  questionVersionId: string;
  answeredAt: Date;
  skillName: string | null;
  stem: RichContent;
  options: { key: string; content: RichContent; isCorrect: boolean }[];
  chosenKeys: string[];
  /** The reviewed explanation, when the question has one. */
  explanation: RichContent | null;
}

export interface StudentMistakes {
  /**
   * The student's latest wrong training answer on the question, or null when
   * they never got it wrong in training. Refuses students without access.
   */
  mistakeOf(
    studentId: string,
    examId: string,
    questionVersionId: string,
  ): Promise<StudentMistake | null>;
}

export const STUDENT_MISTAKES = Symbol("STUDENT_MISTAKES");

/** An item of one of the student's own sessions that was shown to them. */
export interface StudentItem {
  examId: string;
  questionVersionId: string;
}

export interface StudentItems {
  /** The item, when it belongs to the student's session and was presented; null otherwise. */
  shownItem(studentId: string, sessionId: string, itemId: string): Promise<StudentItem | null>;
}

export const STUDENT_ITEMS = Symbol("STUDENT_ITEMS");

export interface TimedExams {
  /**
   * Whether the student is sitting a timed mock exam of this exam right now
   * (started, and its clock has not run out). The study chat stays closed
   * meanwhile, so it cannot be asked to solve the live questions.
   */
  mockExamRunning(studentId: string, examId: string): Promise<boolean>;
}

export const TIMED_EXAMS = Symbol("TIMED_EXAMS");
