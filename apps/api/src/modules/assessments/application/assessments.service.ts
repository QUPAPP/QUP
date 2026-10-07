import { Inject, Injectable } from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import { EXAM_ACCESS, type ExamAccess } from "../../billing/billing.contract.js";
import { CATALOG_LOOKUP, type CatalogLookup } from "../../catalog/catalog.contract.js";
import {
  type StudentQuestionView,
  toStudentQuestionView,
} from "../../questions/domain/student-view.js";
import {
  type DeliverableQuestion,
  QUESTION_READER,
  type QuestionReader,
} from "../../questions/questions.contract.js";
import {
  AssessmentItemNotFound,
  AssessmentNotActive,
  AssessmentNotCompleted,
  AssessmentNotFound,
  ExamNotAvailable,
  IdempotencyKeyReused,
  InvalidAnswer,
  MiniDiagnosticAlreadyCompleted,
  NoQuestionsAvailable,
} from "../domain/assessment.errors.js";
import {
  MINI_DIAGNOSTIC_DEFAULTS,
  PRELIMINARY_RESULT_DEFAULTS,
  SCORING_VERSION,
} from "../domain/assessment-config.js";
import { gradeChoice } from "../domain/grading.js";
import { type PlanDomain, planMiniDiagnostic } from "../domain/mini-diagnostic-plan.js";
import {
  ASSESSMENT_STORE,
  type AssessmentStore,
  type AttemptOutcome,
  type EvidenceTarget,
  type Session,
  type SessionItem,
  type SessionProgress,
} from "../domain/ports.js";
import {
  type ItemOutcome,
  type MeasuredItem,
  type PreliminaryResult,
  type StrengthRating,
  summarizePreliminaryResult,
  type WeaknessRating,
} from "../domain/preliminary-result.js";

export type SubmitInput =
  | { kind: "ANSWER"; chosenKeys: string[]; responseTimeMs: number | null }
  | { kind: "SKIP"; responseTimeMs: number | null };

export interface SubmitResult {
  attemptId: string;
  isCorrect: boolean | null;
  progress: SessionProgress;
  completed: boolean;
  replayed: boolean;
}

/** The preliminary result with skills named instead of identified. */
export interface PreliminaryResultReport {
  score: PreliminaryResult["score"];
  level: PreliminaryResult["level"];
  strengths: { skillName: string; rating: StrengthRating }[];
  weaknesses: { skillName: string; rating: WeaknessRating }[];
  /** The student already has paid access to the exam: nothing left to sell them. */
  hasFullAccess: boolean;
}

export interface CurrentItem {
  item: { id: string; ordinal: number; question: StudentQuestionView } | null;
  progress: SessionProgress;
}

/**
 * Assessment sessions and the answer path (ARCHITECTURE.md §7, WORKFLOWS.md §2–§3).
 * Every method takes the caller's user id and treats another student's session
 * as not found (SECURITY.md: never trust a studentId from the client; no IDOR).
 */
@Injectable()
export class AssessmentsService {
  constructor(
    @Inject(ASSESSMENT_STORE) private readonly store: AssessmentStore,
    @Inject(CATALOG_LOOKUP) private readonly catalog: CatalogLookup,
    @Inject(QUESTION_READER) private readonly questions: QuestionReader,
    @Inject(EXAM_ACCESS) private readonly access: ExamAccess,
    @InjectPinoLogger(AssessmentsService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * Starts — or resumes — the student's mini diagnostic for an exam
   * (PRD §7, OPEN_QUESTIONS.md #10 / #10a).
   */
  async startMiniDiagnostic(
    studentId: string,
    examId: string,
  ): Promise<{ session: Session; created: boolean }> {
    if ((await this.catalog.examStatus(examId)) !== "ACTIVE") throw new ExamNotAvailable();

    const previous = await this.store.sessionsFor(studentId, examId, "MINI_DIAGNOSTIC");
    const open = previous.find((s) => s.status === "CREATED" || s.status === "IN_PROGRESS");
    if (open) return { session: open, created: false };
    if (previous.some((s) => s.status === "COMPLETED")) throw new MiniDiagnosticAlreadyCompleted();

    const taxonomy = await this.catalog.publishedTaxonomy(examId);
    if (!taxonomy) throw new ExamNotAvailable();

    const size =
      (await this.store.miniDiagnosticSize(examId)) ?? MINI_DIAGNOSTIC_DEFAULTS.questionCount;
    const asked = new Set(
      (
        await this.questions.questionIdsOf(
          await this.store.askedQuestionVersionIds(studentId, examId),
        )
      ).values(),
    );
    const candidates = (
      await this.questions.publishedCandidates(taxonomy.taxonomyVersionId)
    ).filter((c) => !asked.has(c.questionId));

    // A question mapped to a subskill counts toward that subskill's skill.
    const skillOfSubskill = new Map<string, string>();
    for (const domain of taxonomy.domains) {
      for (const skill of domain.skills) {
        for (const subskillId of skill.subskillIds) skillOfSubskill.set(subskillId, skill.id);
      }
    }
    const bySkill = new Map<string, typeof candidates>();
    for (const candidate of candidates) {
      const skillId =
        candidate.primarySkillId ??
        (candidate.primarySubskillId
          ? skillOfSubskill.get(candidate.primarySubskillId)
          : undefined);
      if (!skillId) continue;
      bySkill.set(skillId, [...(bySkill.get(skillId) ?? []), candidate]);
    }

    const domains: PlanDomain[] = taxonomy.domains.map((d) => ({
      id: d.id,
      weight: d.weight,
      skills: d.skills.map((s) => ({
        id: s.id,
        weight: s.weight,
        candidates: bySkill.get(s.id) ?? [],
      })),
    }));
    const plan = planMiniDiagnostic({
      domains,
      size,
      targetDifficulty: MINI_DIAGNOSTIC_DEFAULTS.targetDifficulty,
      random: Math.random,
    });
    if (plan.length === 0) throw new NoQuestionsAvailable();
    if (plan.length < size) {
      this.logger.warn(
        { examId, requested: size, planned: plan.length },
        "Mini diagnostic short of questions",
      );
    }

    return this.store.createSession({
      studentId,
      examId,
      type: "MINI_DIAGNOSTIC",
      scoringVersion: SCORING_VERSION,
      items: plan.map((p) => ({ questionVersionId: p.questionVersionId })),
    });
  }

  async get(
    studentId: string,
    sessionId: string,
  ): Promise<{ session: Session; progress: SessionProgress }> {
    const session = await this.owned(studentId, sessionId);
    return { session, progress: await this.store.progress(sessionId) };
  }

  async start(studentId: string, sessionId: string): Promise<Session> {
    const session = await this.owned(studentId, sessionId);
    if (session.status !== "CREATED" && session.status !== "IN_PROGRESS") {
      throw new AssessmentNotActive(session.status);
    }
    return this.store.start(sessionId);
  }

  /** The next unanswered item, redacted for the student (no answer key). */
  async currentItem(studentId: string, sessionId: string): Promise<CurrentItem> {
    const session = await this.owned(studentId, sessionId);
    const items = await this.store.items(sessionId);
    const progress = {
      total: items.length,
      finalized: items.filter((i) => i.attempt !== null).length,
    };
    const next = items.find((i) => i.attempt === null);
    if (!next) return { item: null, progress };
    if (session.status !== "IN_PROGRESS") throw new AssessmentNotActive(session.status);

    const question = await this.question(next.questionVersionId);
    await this.store.markPresented(next.id);
    return {
      item: {
        id: next.id,
        ordinal: next.ordinal,
        question: toStudentQuestionView(toPresentable(question)),
      },
      progress,
    };
  }

  async submit(
    studentId: string,
    sessionId: string,
    itemId: string,
    idempotencyKey: string,
    input: SubmitInput,
  ): Promise<SubmitResult> {
    const session = await this.owned(studentId, sessionId);

    // A retry of an earlier request: answer it without redoing any work.
    const earlier = await this.store.findAttemptByIdempotencyKey(idempotencyKey);
    if (earlier) {
      if (earlier.studentId !== studentId || earlier.assessmentItemId !== itemId) {
        throw new IdempotencyKeyReused();
      }
      const progress = await this.store.progress(sessionId);
      return {
        attemptId: earlier.id,
        isCorrect: earlier.isCorrect,
        progress,
        completed: progress.finalized === progress.total,
        replayed: true,
      };
    }

    const item = (await this.store.items(sessionId)).find((i) => i.id === itemId);
    if (!item) throw new AssessmentItemNotFound();
    const question = await this.question(item.questionVersionId);

    let outcome: AttemptOutcome = { kind: "SKIPPED" };
    if (input.kind === "ANSWER") {
      // Graded here, from the stored answer key. Nothing the client sends about
      // correctness is read (TESTING.md: "forged isCorrect ignored").
      const grade = gradeChoice(question.questionType, question.options, input.chosenKeys);
      if (!grade.ok) throw new InvalidAnswer(grade.reason);
      outcome = { kind: "ANSWERED", chosenKeys: input.chosenKeys, isCorrect: grade.isCorrect };
    }

    const result = await this.store.recordAttempt({
      sessionId,
      examId: session.examId,
      itemId,
      studentId,
      idempotencyKey,
      outcome,
      responseTimeMs: input.responseTimeMs,
      evidence: {
        questionId: question.questionId,
        questionVersionIds: await this.questions.versionIdsOf(question.questionId),
        difficulty: question.difficulty,
        targets: await this.evidenceTargets(question),
      },
    });

    if (result.kind === "RECORDED" && result.completed) {
      this.logger.info({ sessionId, examId: session.examId }, "Assessment completed");
    }
    return {
      attemptId: result.attempt.id,
      isCorrect: result.attempt.isCorrect,
      progress: result.progress,
      completed: result.completed,
      replayed: result.kind === "REPLAYED",
    };
  }

  async complete(studentId: string, sessionId: string): Promise<Session> {
    const session = await this.owned(studentId, sessionId);
    if (session.status === "COMPLETED") return session;
    if (session.status !== "IN_PROGRESS") throw new AssessmentNotActive(session.status);
    return this.store.complete(sessionId);
  }

  /**
   * The preview a student gets before paying (OPEN_QUESTIONS.md #10b). Only
   * the few skills the summary selects are named; the rest of the skill map
   * never leaves this method (PRD §7).
   */
  async result(studentId: string, sessionId: string): Promise<PreliminaryResultReport> {
    const session = await this.owned(studentId, sessionId);
    if (session.status !== "COMPLETED") throw new AssessmentNotCompleted();

    const items = await this.store.items(sessionId);
    const targets = await this.questions.primaryTargetsOf(items.map((i) => i.questionVersionId));
    const nodes = [...targets.values()];
    const reporting = await this.catalog.reportingSkills({
      skillIds: nodes.flatMap((n) => (n.skillId ? [n.skillId] : [])),
      subskillIds: nodes.flatMap((n) => (n.subskillId ? [n.subskillId] : [])),
    });

    const skillNames = new Map<string, string>();
    const measured: MeasuredItem[] = items.map((item) => {
      const target = targets.get(item.questionVersionId);
      const skill = target?.skillId
        ? reporting.skills.get(target.skillId)
        : reporting.subskills.get(target?.subskillId ?? "");
      if (!skill) throw new Error(`Item ${item.id} measures no skill of the taxonomy.`);
      skillNames.set(skill.id, skill.name);
      return { skillId: skill.id, outcome: outcomeOf(item) };
    });

    const summary = summarizePreliminaryResult(measured, PRELIMINARY_RESULT_DEFAULTS);
    const named = <R>(entry: { skillId: string; rating: R }) => {
      const skillName = skillNames.get(entry.skillId);
      if (skillName === undefined) throw new Error(`Skill ${entry.skillId} was not measured.`);
      return { skillName, rating: entry.rating };
    };
    return {
      score: summary.score,
      level: summary.level,
      strengths: summary.strengths.map(named),
      weaknesses: summary.weaknesses.map(named),
      hasFullAccess: await this.access.hasExamAccess(studentId, session.examId),
    };
  }

  private async owned(studentId: string, sessionId: string): Promise<Session> {
    const session = await this.store.findSession(sessionId);
    if (session?.studentId !== studentId) throw new AssessmentNotFound();
    return session;
  }

  private async question(questionVersionId: string): Promise<DeliverableQuestion> {
    const question = (await this.questions.forDelivery([questionVersionId])).get(questionVersionId);
    if (!question) throw new Error(`Question version ${questionVersionId} of an item is missing.`);
    return question;
  }

  /** Every node the question measures, with the engine settings of each (ADAPTIVE_ENGINE.md §7). */
  private async evidenceTargets(question: DeliverableQuestion): Promise<EvidenceTarget[]> {
    const settings = await this.catalog.nodeSettings({
      skillIds: question.mappings.flatMap((m) => (m.skillId ? [m.skillId] : [])),
      subskillIds: question.mappings.flatMap((m) => (m.subskillId ? [m.subskillId] : [])),
    });
    return question.mappings.map((m) => {
      const node = m.skillId
        ? settings.skills.get(m.skillId)
        : settings.subskills.get(m.subskillId ?? "");
      if (!node) throw new Error("A mapped learning node is missing from the taxonomy.");
      return {
        skillId: m.skillId,
        subskillId: m.subskillId,
        role: m.role,
        attributionWeight: m.attributionWeight,
        masteryThreshold: node.masteryThreshold,
        minCoverage: node.minCoverage,
      };
    });
  }
}

function outcomeOf(item: SessionItem): ItemOutcome {
  if (item.attempt?.resultType !== "ANSWERED") return "NOT_ANSWERED";
  return item.attempt.isCorrect ? "CORRECT" : "INCORRECT";
}

function toPresentable(question: DeliverableQuestion) {
  return {
    id: question.questionVersionId,
    questionType: question.questionType,
    stem: question.stem,
    options: question.options,
  };
}
