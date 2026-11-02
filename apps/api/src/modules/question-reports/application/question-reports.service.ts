import { Inject, Injectable } from "@nestjs/common";

import type { ActorContext } from "../../../common/actor.js";
import { STUDENT_ITEMS, type StudentItems } from "../../assessments/assessments.contract.js";
import { USER_DIRECTORY, type UserDirectory } from "../../auth/auth.contract.js";
import {
  QUESTION_AUTHOR,
  QUESTION_READER,
  type QuestionAuthor,
  type QuestionReader,
} from "../../questions/questions.contract.js";
import {
  ReportAlreadyClosed,
  ReportItemNotFound,
  ReportNotFound,
} from "../domain/question-report.errors.js";
import {
  type QuestionReport,
  REPORT_STORE,
  type ReportClosing,
  type ReportReason,
  type ReportStatus,
  type ReportStore,
} from "../domain/question-report.js";

const STEM_PREVIEW_CHARS = 160;

/**
 * Students report problems in questions they were shown; reviewers resolve
 * or dismiss the reports. A report never changes a question: the fix goes
 * through a new version and review as usual.
 */
@Injectable()
export class QuestionReportsService {
  constructor(
    @Inject(REPORT_STORE) private readonly store: ReportStore,
    @Inject(STUDENT_ITEMS) private readonly items: StudentItems,
    @Inject(QUESTION_READER) private readonly questions: QuestionReader,
    @Inject(QUESTION_AUTHOR) private readonly author: QuestionAuthor,
    @Inject(USER_DIRECTORY) private readonly users: UserDirectory,
  ) {}

  async report(
    studentId: string,
    target: { sessionId: string; itemId: string },
    input: { reason: ReportReason; note: string | null },
  ) {
    const item = await this.items.shownItem(studentId, target.sessionId, target.itemId);
    if (!item) throw new ReportItemNotFound();
    const questionId = (await this.questions.questionIdsOf([item.questionVersionId])).get(
      item.questionVersionId,
    );
    if (!questionId) throw new ReportItemNotFound();
    return this.store.openOnce({
      questionId,
      questionVersionId: item.questionVersionId,
      reportedBy: studentId,
      reason: input.reason,
      note: input.note,
    });
  }

  async list(query: { status: ReportStatus | null; limit: number; offset: number }) {
    const [{ items, hasMore }, open] = await Promise.all([
      this.store.list(query),
      this.store.openCount(),
    ]);
    const people = await this.users.describe([...new Set(items.map((r) => r.reportedBy))]);
    const versions = await Promise.all(
      [...new Set(items.map((r) => r.questionVersionId))].map((id) =>
        this.author.assistedVersion(id),
      ),
    );
    const stems = new Map(
      versions.flatMap((version) =>
        version ? [[version.id, version.stem.slice(0, STEM_PREVIEW_CHARS)] as const] : [],
      ),
    );
    return {
      items: items.map((report) => ({
        ...view(report),
        stemPreview: stems.get(report.questionVersionId) ?? "",
        reporter: people.get(report.reportedBy) ?? { email: null, displayName: null },
      })),
      hasMore,
      openCount: open,
    };
  }

  async close(
    reportId: string,
    closing: { status: ReportClosing; note: string | null },
    actor: ActorContext,
  ) {
    if (!actor.userId) throw new Error("Closing a report needs a signed-in reviewer.");
    const report = await this.store.find(reportId);
    if (!report) throw new ReportNotFound();
    const closed = await this.store.close(reportId, { ...closing, by: actor.userId });
    if (!closed) throw new ReportAlreadyClosed();
    return view(closed);
  }
}

export function view(report: QuestionReport) {
  return {
    id: report.id,
    questionId: report.questionId,
    questionVersionId: report.questionVersionId,
    reason: report.reason,
    note: report.note,
    status: report.status,
    resolutionNote: report.resolutionNote,
    resolvedAt: report.resolvedAt?.toISOString() ?? null,
    createdAt: report.createdAt.toISOString(),
  };
}
