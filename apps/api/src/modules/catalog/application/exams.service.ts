import { Inject, Injectable } from "@nestjs/common";

import {
  ExamHasNoPublishedTaxonomy,
  ExamNotFound,
  InvalidExamTransition,
} from "../domain/catalog.errors.js";
import { canTransitionExam } from "../domain/exam-lifecycle.js";
import {
  CATALOG_STORE,
  type CatalogStore,
  type Exam,
  type ExamChanges,
  type NewExam,
} from "../domain/ports.js";

@Injectable()
export class ExamsService {
  constructor(@Inject(CATALOG_STORE) private readonly store: CatalogStore) {}

  create(exam: NewExam): Promise<Exam> {
    return this.store.createExam(exam);
  }

  listAll(): Promise<Exam[]> {
    return this.store.listExams({});
  }

  /** What students see: only exams currently offered. */
  listAvailable(): Promise<Exam[]> {
    return this.store.listExams({ status: "ACTIVE" });
  }

  /** A non-active exam is reported as not found, so drafts are not discoverable. */
  async getAvailable(examId: string): Promise<Exam> {
    const exam = await this.store.findExam(examId);
    if (exam?.status !== "ACTIVE") throw new ExamNotFound();
    return exam;
  }

  async update(examId: string, changes: ExamChanges): Promise<Exam> {
    const exam = await this.store.findExam(examId);
    if (!exam) throw new ExamNotFound();

    if (changes.status !== undefined && changes.status !== exam.status) {
      if (!canTransitionExam(exam.status, changes.status)) {
        throw new InvalidExamTransition(exam.status, changes.status);
      }
      if (changes.status === "ACTIVE" && !(await this.store.hasPublishedTaxonomy(examId))) {
        throw new ExamHasNoPublishedTaxonomy();
      }
    }
    return this.store.updateExam(examId, changes);
  }
}
