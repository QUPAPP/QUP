import { Inject, Injectable } from "@nestjs/common";
import { type ErrorType, explainMistake, type MistakeExplanation } from "@qup/ai-gateway";

import { APP_CONFIG, type AppConfig } from "../../../config/app-config.js";
import {
  STUDENT_MISTAKES,
  type StudentMistake,
  type StudentMistakes,
} from "../../assessments/assessments.contract.js";
import type { RichContent } from "../../questions/questions.contract.js";
import {
  AiDailyLimitReached,
  AiMistakeNotFound,
  AiStudentExplanationsOff,
} from "../domain/ai.errors.js";
import { AI_RUN_STORE, type AiRunStore } from "../domain/ports.js";
import { AiRunner } from "./ai-runner.service.js";

const SUBJECT_STUDENT_MISTAKE = "student_mistake";
/** New explanations a student may ask for per day; repeats of a cached one are free. */
export const STUDENT_EXPLANATIONS_PER_DAY = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface MistakeExplanationView {
  errorType: ErrorType;
  explanation: string;
  tip: string;
  /** True when this answer was produced earlier for the same mistake. */
  cached: boolean;
}

function plainText(content: RichContent | null): string | null {
  if (!content) return null;
  return content.blocks
    .map((block) => (block.type === "text" ? block.text : block.latex))
    .join(" ");
}

/**
 * A personalised explanation of a student's own wrong training answer
 * (AI_INTEGRATION.md "Student Explanation", "Error Classification"). Off until
 * the product owner turns it on (OPEN_QUESTIONS.md #18). Grounded on the
 * stored answer key and the reviewed explanation; the classification is
 * shown to the student and never touches mastery.
 */
@Injectable()
export class StudentTutorService {
  constructor(
    private readonly runner: AiRunner,
    @Inject(AI_RUN_STORE) private readonly runs: AiRunStore,
    @Inject(STUDENT_MISTAKES) private readonly mistakes: StudentMistakes,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  enabled(): boolean {
    return this.config.ai.studentExplanations && this.runner.providerName !== null;
  }

  async explainMistake(
    studentId: string,
    examId: string,
    questionVersionId: string,
  ): Promise<MistakeExplanationView> {
    if (!this.config.ai.studentExplanations) throw new AiStudentExplanationsOff();
    this.runner.assertAvailable();
    const mistake = await this.mistakes.mistakeOf(studentId, examId, questionVersionId);
    if (!mistake) throw new AiMistakeNotFound();

    const subject = { type: SUBJECT_STUDENT_MISTAKE, id: questionVersionId };
    // The same wrong answer gets the same explanation: no second model call.
    const cached = await this.runs.latestOutput({
      task: explainMistake.name,
      promptVersion: explainMistake.promptVersion,
      requestedBy: studentId,
      subjectType: subject.type,
      subjectId: subject.id,
      since: mistake.answeredAt,
    });
    if (cached) return view(cached as MistakeExplanation, true);

    const today = await this.runs.countByRequesterSince(
      explainMistake.name,
      studentId,
      new Date(Date.now() - DAY_MS),
    );
    if (today >= STUDENT_EXPLANATIONS_PER_DAY) {
      throw new AiDailyLimitReached(STUDENT_EXPLANATIONS_PER_DAY);
    }
    const output = await this.runner.run(explainMistake, inputOf(mistake), subject, studentId);
    return view(output, false);
  }
}

function inputOf(mistake: StudentMistake) {
  return {
    question: {
      stem: plainText(mistake.stem) ?? "",
      options: mistake.options.map((option) => ({
        key: option.key,
        text: plainText(option.content) ?? "",
        isCorrect: option.isCorrect,
      })),
    },
    chosenKeys: mistake.chosenKeys,
    approvedExplanation: plainText(mistake.explanation),
    skillName: mistake.skillName,
  };
}

function view(output: MistakeExplanation, cached: boolean): MistakeExplanationView {
  return { errorType: output.errorType, explanation: output.explanation, tip: output.tip, cached };
}
