/**
 * Public read contract of Billing, for other modules (AGENTS.md §5).
 * Owned here, the provider: assessments → billing, never back.
 *
 * DOMAIN_MODEL.md §3: "entitlement checked server-side" — this is that check.
 */
export interface ExamAccess {
  /** Whether the student has an entitlement in force for the exam right now. */
  hasExamAccess(studentId: string, examId: string): Promise<boolean>;
}

export const EXAM_ACCESS = Symbol("EXAM_ACCESS");
