/**
 * Exam status lifecycle. Forward-only, like the other lifecycles in
 * DOMAIN_MODEL.md §4: an exam is drafted, offered to students, then retired.
 * Retired exams stay referenceable (PRD §9: archive instead of delete).
 */

export type ExamStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

const ALLOWED: Record<ExamStatus, readonly ExamStatus[]> = {
  DRAFT: ["ACTIVE", "ARCHIVED"],
  ACTIVE: ["ARCHIVED"],
  ARCHIVED: [],
};

export function canTransitionExam(from: ExamStatus, to: ExamStatus): boolean {
  return from === to || ALLOWED[from].includes(to);
}
