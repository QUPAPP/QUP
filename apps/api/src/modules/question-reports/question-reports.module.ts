import { Module } from "@nestjs/common";

import { AssessmentsModule } from "../assessments/assessments.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { QuestionsModule } from "../questions/questions.module.js";
import { QuestionReportsService } from "./application/question-reports.service.js";
import { REPORT_STORE } from "./domain/question-report.js";
import { DrizzleReportStore } from "./infrastructure/drizzle-report-store.js";
import {
  AdminQuestionReportsController,
  StudentQuestionReportsController,
} from "./presentation/question-reports.controller.js";

/**
 * Question reports: students flag problems in questions they were shown;
 * reviewers (questions.review) resolve or dismiss them. Owns
 * question_reports; reads sessions, questions and names through contracts.
 */
@Module({
  imports: [AssessmentsModule, QuestionsModule, AuthModule],
  controllers: [StudentQuestionReportsController, AdminQuestionReportsController],
  providers: [QuestionReportsService, { provide: REPORT_STORE, useClass: DrizzleReportStore }],
})
export class QuestionReportsModule {}
