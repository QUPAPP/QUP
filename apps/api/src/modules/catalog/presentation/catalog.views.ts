import type { Exam, TaxonomyVersion } from "../domain/ports.js";

/** Response shapes. Dates are UTC ISO strings (API_CONTRACTS.md conventions). */

export interface ExamView {
  id: string;
  code: string;
  slug: string;
  nameAr: string;
  nameEn: string | null;
  description: string | null;
  status: Exam["status"];
  createdAt: string;
}

/** What a student sees: no lifecycle or audit fields. */
export type PublicExamView = Omit<ExamView, "status" | "createdAt">;

export interface TaxonomyVersionView {
  id: string;
  examId: string;
  versionCode: string;
  status: TaxonomyVersion["status"];
  effectiveFrom: string | null;
  createdAt: string;
}

export function toExamView(exam: Exam): ExamView {
  return {
    id: exam.id,
    code: exam.code,
    slug: exam.slug,
    nameAr: exam.nameAr,
    nameEn: exam.nameEn,
    description: exam.description,
    status: exam.status,
    createdAt: exam.createdAt.toISOString(),
  };
}

export function toPublicExamView(exam: Exam): PublicExamView {
  const { status: _status, createdAt: _createdAt, ...view } = toExamView(exam);
  return view;
}

export function toVersionView(version: TaxonomyVersion): TaxonomyVersionView {
  return {
    id: version.id,
    examId: version.examId,
    versionCode: version.versionCode,
    status: version.status,
    effectiveFrom: version.effectiveFrom?.toISOString() ?? null,
    createdAt: version.createdAt.toISOString(),
  };
}
