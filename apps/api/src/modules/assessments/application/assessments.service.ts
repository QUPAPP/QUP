import { Inject, Injectable } from "@nestjs/common";
import { REASSESSMENT_CONFIG_V1 } from "@qup/adaptive-engine";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import { ADAPTIVE_SELECTOR, type AdaptiveSelector } from "../../adaptive/adaptive.contract.js";
import { EXAM_ACCESS, type ExamAccess } from "../../billing/billing.contract.js";
import { CATALOG_LOOKUP, type CatalogLookup } from "../../catalog/catalog.contract.js";
import {
  REASSESSMENT_RECORDER,
  type ReassessmentOutcome,
  type ReassessmentRecorder,
  SKILL_STANDING_READER,
  type SkillStandingReader,
} from "../../mastery/mastery.contract.js";
import type { RichContent } from "../../questions/domain/question-content.js";
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
  PRELIMINARY_LEVELS_KEY,
  SETTINGS_READER,
  type SettingsReader,
} from "../../settings/settings.contract.js";
import {
  AssessmentItemNotFound,
  AssessmentNotActive,
  AssessmentNotCompleted,
  AssessmentNotFound,
  ExamNotAvailable,
  FullDiagnosticAlreadyCompleted,
  FullDiagnosticRequiresAccess,
  IdempotencyKeyReused,
  InvalidAnswer,
  MiniDiagnosticAlreadyCompleted,
  NoQuestionsAvailable,
  NothingToTrain,
  ReassessmentInProgress,
  ReassessmentNotEnoughQuestions,
  ReassessmentRequiresAccess,
  SkillNotFound,
  SkillNotReadyForReassessment,
  TrainingRequiresAccess,
} from "../domain/assessment.errors.js";
import {
  FULL_DIAGNOSTIC_DEFAULTS,
  MINI_DIAGNOSTIC_DEFAULTS,
  PRELIMINARY_RESULT_DEFAULTS,
  SCORING_VERSION,
  TRAINING_DEFAULTS,
} from "../domain/assessment-config.js";
import {
  type Blueprint,
  type DiagnosticBlueprintType,
  effectiveDomainWeights,
} from "../domain/blueprint.js";
import { type PlanDomain, planDiagnostic } from "../domain/diagnostic-plan.js";
import { gradeChoice } from "../domain/grading.js";
import {
  ASSESSMENT_STORE,
  type AssessmentStore,
  type AttemptOutcome,
  BLUEPRINT_STORE,
  type BlueprintStore,
  type EvidenceTarget,
  type Session,
  type SessionHistoryQuery,
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

/** How each diagnostic is planned (PRD §7, OPEN_QUESTIONS.md #9a, #10). */
interface Diagnostic {
  type: DiagnosticBlueprintType;
  defaults: { questionCount: number; targetDifficulty: number };
  /** The size covers questions already answered: the diagnosis continues, never restarts. */
  continuesEvidence: boolean;
  alreadyCompleted: (sessionId: string) => Error;
}

const DIAGNOSTICS: Record<DiagnosticBlueprintType, Diagnostic> = {
  MINI_DIAGNOSTIC: {
    type: "MINI_DIAGNOSTIC",
    defaults: MINI_DIAGNOSTIC_DEFAULTS,
    continuesEvidence: false,
    alreadyCompleted: (sessionId) => new MiniDiagnosticAlreadyCompleted(sessionId),
  },
  FULL_DIAGNOSTIC: {
    type: "FULL_DIAGNOSTIC",
    defaults: FULL_DIAGNOSTIC_DEFAULTS,
    continuesEvidence: true,
    alreadyCompleted: (sessionId) => new FullDiagnosticAlreadyCompleted(sessionId),
  },
};

export type SubmitInput =
  | { kind: "ANSWER"; chosenKeys: string[]; responseTimeMs: number | null }
  | { kind: "SKIP"; responseTimeMs: number | null };

export interface SubmitResult {
  attemptId: string;
  isCorrect: boolean | null;
  progress: SessionProgress;
  completed: boolean;
  replayed: boolean;
  /** Training only, once the attempt is stored: the remediation step (ADAPTIVE_ENGINE.md §20). */
  review?: AnswerReview;
}

export interface AnswerReview {
  correctOptionKeys: string[];
  explanation: RichContent | null;
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
  item: {
    id: string;
    ordinal: number;
    question: StudentQuestionView;
    /** Training: the skill the adaptive decision chose this question for. */
    target?: { skillName: string };
  } | null;
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
    @Inject(BLUEPRINT_STORE) private readonly blueprints: BlueprintStore,
    @Inject(CATALOG_LOOKUP) private readonly catalog: CatalogLookup,
    @Inject(QUESTION_READER) private readonly questions: QuestionReader,
    @Inject(EXAM_ACCESS) private readonly access: ExamAccess,
    @Inject(SETTINGS_READER) private readonly settings: SettingsReader,
    @Inject(ADAPTIVE_SELECTOR) private readonly adaptive: AdaptiveSelector,
    @Inject(SKILL_STANDING_READER) private readonly standings: SkillStandingReader,
    @Inject(REASSESSMENT_RECORDER) private readonly reassessments: ReassessmentRecorder,
    @InjectPinoLogger(AssessmentsService.name) private readonly logger: PinoLogger,
  ) {}

  async history(studentId: string, query: SessionHistoryQuery) {
    const page = await this.store.history(studentId, query);
    const names = await this.catalog.examNames([
      ...new Set(page.items.map(({ session }) => session.examId)),
    ]);
    return {
      ...page,
      items: page.items.map((entry) => {
        const examName = names.get(entry.session.examId);
        if (examName === undefined)
          throw new Error("A session's exam is missing from the catalog.");
        return { ...entry, examName };
      }),
    };
  }

  /**
   * Starts — or resumes — the student's mini diagnostic for an exam
   * (PRD §7, OPEN_QUESTIONS.md #10 / #10a).
   */
  async startMiniDiagnostic(
    studentId: string,
    examId: string,
  ): Promise<{ session: Session; created: boolean }> {
    await this.assertExamActive(examId);
    return this.openDiagnostic(studentId, examId, DIAGNOSTICS.MINI_DIAGNOSTIC);
  }

  /**
   * Starts — or resumes — the paid full diagnostic (PRD §6–§7, OPEN_QUESTIONS.md
   * #9a). It completes what the student already answered in this exam.
   */
  async startFullDiagnostic(
    studentId: string,
    examId: string,
  ): Promise<{ session: Session; created: boolean }> {
    await this.assertExamActive(examId);
    if (!(await this.access.hasExamAccess(studentId, examId))) {
      throw new FullDiagnosticRequiresAccess();
    }
    return this.openDiagnostic(studentId, examId, DIAGNOSTICS.FULL_DIAGNOSTIC);
  }

  private async assertExamActive(examId: string): Promise<void> {
    if ((await this.catalog.examStatus(examId)) !== "ACTIVE") throw new ExamNotAvailable();
  }

  /** Resumes the open session of this kind, or plans and creates one. */
  private async openDiagnostic(
    studentId: string,
    examId: string,
    kind: Diagnostic,
  ): Promise<{ session: Session; created: boolean }> {
    const previous = await this.store.sessionsFor(studentId, examId, kind.type);
    const open = previous.find((s) => s.status === "CREATED" || s.status === "IN_PROGRESS");
    if (open) return { session: open, created: false };
    const completed = previous.find((s) => s.status === "COMPLETED");
    if (completed) throw kind.alreadyCompleted(completed.id);

    const taxonomy = await this.catalog.publishedTaxonomy(examId);
    if (!taxonomy) throw new ExamNotAvailable();
    const blueprint = await this.usableBlueprint(examId, kind.type, taxonomy.taxonomyVersionId);
    const size = blueprint?.questionCount ?? kind.defaults.questionCount;
    const domainWeights = blueprint
      ? effectiveDomainWeights(taxonomy.domains, blueprint.domainWeights)
      : null;

    // A question mapped to a subskill counts toward that subskill's skill.
    const skillOfSubskill = new Map<string, string>();
    for (const domain of taxonomy.domains) {
      for (const skill of domain.skills) {
        for (const subskillId of skill.subskillIds) skillOfSubskill.set(subskillId, skill.id);
      }
    }
    const skillOf = (node: { skillId: string | null; subskillId: string | null }) =>
      node.skillId ?? (node.subskillId ? skillOfSubskill.get(node.subskillId) : undefined);

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
    const bySkill = new Map<string, typeof candidates>();
    for (const candidate of candidates) {
      const skillId = skillOf({
        skillId: candidate.primarySkillId,
        subskillId: candidate.primarySubskillId,
      });
      if (!skillId) continue;
      bySkill.set(skillId, [...(bySkill.get(skillId) ?? []), candidate]);
    }

    const domains: PlanDomain[] = taxonomy.domains.map((d) => ({
      id: d.id,
      weight: domainWeights?.get(d.id) ?? d.weight,
      skills: d.skills.map((s) => ({
        id: s.id,
        weight: s.weight,
        candidates: bySkill.get(s.id) ?? [],
      })),
    }));
    const plan = planDiagnostic({
      domains,
      size,
      targetDifficulty: kind.defaults.targetDifficulty,
      random: Math.random,
      answered: kind.continuesEvidence
        ? await this.answeredPerSkill(studentId, examId, skillOf)
        : undefined,
    });
    if (plan.length === 0) throw new NoQuestionsAvailable();
    if (plan.length < size) {
      this.logger.info(
        { examId, type: kind.type, requested: size, planned: plan.length },
        "Diagnostic planned below its size (questions already answered, or too few published)",
      );
    }

    // The result is scored with the boundaries in effect now, even if an admin changes them later.
    const levels = await this.settings.current(PRELIMINARY_LEVELS_KEY);
    return this.store.createSession({
      studentId,
      examId,
      type: kind.type,
      blueprintId: blueprint?.id ?? null,
      scoringVersion: SCORING_VERSION,
      resultConfigVersion: levels.version === 0 ? null : levels.version,
      items: plan.map((p) => ({ questionVersionId: p.questionVersionId })),
    });
  }

  /**
   * The exam's active blueprint of this type, unless it is pinned to a
   * taxonomy version that is no longer the published one: its domain weights
   * would point at retired nodes, so the defaults apply until an admin
   * activates a blueprint for the new version.
   */
  private async usableBlueprint(
    examId: string,
    type: DiagnosticBlueprintType,
    publishedVersionId: string,
  ): Promise<Blueprint | null> {
    const blueprint = await this.blueprints.active(examId, type);
    if (!blueprint || blueprint.taxonomyVersionId === publishedVersionId) return blueprint;
    this.logger.warn(
      { examId, type, blueprintId: blueprint.id },
      "Active blueprint is pinned to an unpublished taxonomy version; defaults apply",
    );
    return null;
  }

  /** Distinct questions the student answered in this exam, per skill (OPEN_QUESTIONS.md #9a). */
  private async answeredPerSkill(
    studentId: string,
    examId: string,
    skillOf: (node: { skillId: string | null; subskillId: string | null }) => string | undefined,
  ): Promise<Map<string, number>> {
    const versionIds = await this.store.answeredQuestionVersionIds(studentId, examId);
    const [questionOf, targets] = await Promise.all([
      this.questions.questionIdsOf(versionIds),
      this.questions.primaryTargetsOf(versionIds),
    ]);
    const perSkill = new Map<string, Set<string>>();
    for (const versionId of versionIds) {
      const target = targets.get(versionId);
      const questionId = questionOf.get(versionId);
      const skillId = target ? skillOf(target) : undefined;
      if (!skillId || !questionId) continue;
      perSkill.set(skillId, (perSkill.get(skillId) ?? new Set()).add(questionId));
    }
    return new Map([...perSkill].map(([skillId, questions]) => [skillId, questions.size]));
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
    if (session.plannedItemCount !== null) return this.trainingItem(session);
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
      const review = await this.reviewOf(session, itemId);
      return {
        attemptId: earlier.id,
        isCorrect: earlier.isCorrect,
        progress,
        completed: progress.finalized === progress.total,
        replayed: true,
        ...(review ? { review } : {}),
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
      // Graded right away; reading the result records it too, should this step be lost.
      if (session.type === "SKILL_REASSESSMENT") await this.gradeReassessment(session);
    }
    const review = await this.reviewOf(session, itemId, question);
    return {
      attemptId: result.attempt.id,
      isCorrect: result.attempt.isCorrect,
      progress: result.progress,
      completed: result.completed,
      replayed: result.kind === "REPLAYED",
      ...(review ? { review } : {}),
    };
  }

  async complete(studentId: string, sessionId: string): Promise<Session> {
    const session = await this.owned(studentId, sessionId);
    if (session.status === "COMPLETED") return session;
    if (session.status !== "IN_PROGRESS") throw new AssessmentNotActive(session.status);
    // Training may stop at any time; a planned diagnostic only when every item is finalized.
    return this.store.complete(sessionId, { endingEarly: session.plannedItemCount !== null });
  }

  /**
   * Starts — or resumes — a skill reassessment (ADAPTIVE_ENGINE.md §12–§13,
   * WORKFLOWS.md §5): five questions on a READY_FOR_REASSESSMENT skill,
   * planned up front, unseen ones first. A pass makes the skill MASTERED.
   */
  async startReassessment(
    studentId: string,
    examId: string,
    skillId: string,
  ): Promise<{ session: Session; created: boolean }> {
    await this.assertExamActive(examId);
    if (!(await this.access.hasExamAccess(studentId, examId))) {
      throw new ReassessmentRequiresAccess();
    }
    const skill = (await this.standings.standing(studentId, examId))?.domains
      .flatMap((domain) => domain.skills)
      .find((candidate) => candidate.id === skillId);
    if (!skill) throw new SkillNotFound();

    const open = (await this.store.sessionsFor(studentId, examId, "SKILL_REASSESSMENT")).find(
      (s) => s.status === "CREATED" || s.status === "IN_PROGRESS",
    );
    if (open?.targetSkillId === skillId) return { session: open, created: false };
    if (open) throw new ReassessmentInProgress(open.id);
    if (skill.state !== "READY_FOR_REASSESSMENT") {
      throw new SkillNotReadyForReassessment(
        skill.state,
        skill.reassessment?.remainingAttempts ?? null,
      );
    }

    const size = REASSESSMENT_CONFIG_V1.questionCount;
    const questionVersionIds = await this.adaptive.planReassessment({
      studentId,
      examId,
      skillId,
      askedQuestionIds: await this.askedQuestionIds(studentId, examId),
      size,
    });
    if (questionVersionIds.length < size) throw new ReassessmentNotEnoughQuestions();
    return this.store.createSession({
      studentId,
      examId,
      type: "SKILL_REASSESSMENT",
      blueprintId: null,
      targetSkillId: skillId,
      scoringVersion: SCORING_VERSION,
      resultConfigVersion: null,
      items: questionVersionIds.map((questionVersionId) => ({ questionVersionId })),
    });
  }

  /** The outcome of a finished reassessment, recording it if that has not happened yet. */
  async reassessmentResult(
    studentId: string,
    sessionId: string,
  ): Promise<{
    outcome: ReassessmentOutcome;
    skillName: string;
    remainingAttempts: number | null;
  }> {
    const session = await this.owned(studentId, sessionId);
    if (session.type !== "SKILL_REASSESSMENT") throw new AssessmentNotFound();
    if (session.status !== "COMPLETED") throw new AssessmentNotCompleted();
    const outcome =
      (await this.reassessments.outcomeOf(sessionId)) ?? (await this.gradeReassessment(session));
    const names = await this.catalog.reportingSkills({
      skillIds: [outcome.skillId],
      subskillIds: [],
    });
    const skill = (await this.standings.standing(studentId, session.examId))?.domains
      .flatMap((domain) => domain.skills)
      .find((candidate) => candidate.id === outcome.skillId);
    return {
      outcome,
      skillName: names.skills.get(outcome.skillId)?.name ?? "",
      remainingAttempts: outcome.passed ? null : (skill?.reassessment?.remainingAttempts ?? null),
    };
  }

  /** Skipped and unanswered items are not correct (OPEN_QUESTIONS.md #12e). */
  private async gradeReassessment(session: Session): Promise<ReassessmentOutcome> {
    if (!session.targetSkillId) throw new Error(`Reassessment ${session.id} has no target skill.`);
    const items = await this.store.items(session.id);
    return this.reassessments.record({
      studentId: session.studentId,
      examId: session.examId,
      skillId: session.targetSkillId,
      sessionId: session.id,
      correct: items.filter((i) => i.attempt?.isCorrect === true).length,
      total: items.length,
    });
  }

  /**
   * Starts — or resumes — adaptive training (PRD §6, ADAPTIVE_ENGINE.md
   * §15–§20). Paid; refused up front when nothing in the exam is left to train.
   */
  async startTraining(
    studentId: string,
    examId: string,
  ): Promise<{ session: Session; created: boolean }> {
    await this.assertExamActive(examId);
    if (!(await this.access.hasExamAccess(studentId, examId))) {
      throw new TrainingRequiresAccess();
    }
    const open = (await this.store.sessionsFor(studentId, examId, "ADAPTIVE_TRAINING")).find(
      (s) => s.status === "CREATED" || s.status === "IN_PROGRESS",
    );
    if (open) return { session: open, created: false };

    const anything = await this.adaptive.decide({
      studentId,
      examId,
      current: null,
      askedQuestionIds: await this.askedQuestionIds(studentId, examId),
    });
    if (!anything) throw new NothingToTrain();
    return this.store.createSession({
      studentId,
      examId,
      type: "ADAPTIVE_TRAINING",
      blueprintId: null,
      plannedItemCount: TRAINING_DEFAULTS.questionCount,
      scoringVersion: SCORING_VERSION,
      resultConfigVersion: null,
      items: [],
    });
  }

  /**
   * The pending training item, or the next one chosen now (WORKFLOWS.md §4).
   * When nothing is left to train, the session ends here.
   */
  private async trainingItem(session: Session): Promise<CurrentItem> {
    let items = await this.store.items(session.id);
    let pending = items.find((i) => i.attempt === null);
    const finalized = () => items.filter((i) => i.attempt !== null).length;
    const planned = session.plannedItemCount ?? 0;

    if (!pending && session.status === "IN_PROGRESS" && finalized() < planned) {
      const decision = await this.adaptive.decide({
        studentId: session.studentId,
        examId: session.examId,
        current: await this.currentTarget(items),
        askedQuestionIds: await this.askedQuestionIds(session.studentId, session.examId),
      });
      if (!decision) {
        this.logger.info({ sessionId: session.id }, "Training ended: nothing left to train");
        await this.store.complete(session.id, { endingEarly: true });
        return { item: null, progress: { total: planned, finalized: finalized() } };
      }
      // A concurrent request may have appended first; either way the pending item is read back.
      await this.store.appendAdaptiveItem({
        sessionId: session.id,
        questionVersionId: decision.selectedQuestionVersionId,
        recordDecision: (executor) => this.adaptive.recordDecision(executor, decision),
      });
      items = await this.store.items(session.id);
      pending = items.find((i) => i.attempt === null);
    }

    const progress = { total: planned, finalized: finalized() };
    if (!pending) return { item: null, progress };
    if (session.status !== "IN_PROGRESS") throw new AssessmentNotActive(session.status);

    const question = await this.question(pending.questionVersionId);
    const targets = await this.adaptive.targetsOf(
      pending.adaptiveDecisionId ? [pending.adaptiveDecisionId] : [],
    );
    const target = targets.get(pending.adaptiveDecisionId ?? "");
    await this.store.markPresented(pending.id);
    return {
      item: {
        id: pending.id,
        ordinal: pending.ordinal,
        question: toStudentQuestionView(toPresentable(question)),
        ...(target ? { target: { skillName: target.skillName } } : {}),
      },
      progress,
    };
  }

  /** The latest item's target, with the answers given on it in this session (skips excluded). */
  private async currentTarget(
    items: readonly SessionItem[],
  ): Promise<{ skillId: string; recentResults: boolean[] } | null> {
    const decisionIds = items.flatMap((i) => (i.adaptiveDecisionId ? [i.adaptiveDecisionId] : []));
    const targets = await this.adaptive.targetsOf(decisionIds);
    const skillOf = (item: SessionItem) => targets.get(item.adaptiveDecisionId ?? "")?.skillId;
    const last = items.at(-1);
    const skillId = last ? skillOf(last) : undefined;
    if (!skillId) return null;
    return {
      skillId,
      recentResults: items
        .filter((i) => skillOf(i) === skillId && i.attempt?.resultType === "ANSWERED")
        .map((i) => i.attempt?.isCorrect === true),
    };
  }

  private async askedQuestionIds(studentId: string, examId: string): Promise<Set<string>> {
    const versionIds = await this.store.askedQuestionVersionIds(studentId, examId);
    return new Set((await this.questions.questionIdsOf(versionIds)).values());
  }

  /** The correct keys and explanation, after the attempt is stored and only in training. */
  private async reviewOf(
    session: Session,
    itemId: string,
    known?: DeliverableQuestion,
  ): Promise<AnswerReview | undefined> {
    if (session.type !== "ADAPTIVE_TRAINING") return undefined;
    let question = known;
    if (!question) {
      const item = (await this.store.items(session.id)).find((i) => i.id === itemId);
      if (!item) return undefined;
      question = await this.question(item.questionVersionId);
    }
    return {
      correctOptionKeys: question.options.filter((o) => o.isCorrect).map((o) => o.key),
      explanation: question.explanation,
    };
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

    const levels = await this.settings.atVersion(
      PRELIMINARY_LEVELS_KEY,
      session.resultConfigVersion,
    );
    const summary = summarizePreliminaryResult(measured, {
      ...PRELIMINARY_RESULT_DEFAULTS,
      levels,
    });
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
