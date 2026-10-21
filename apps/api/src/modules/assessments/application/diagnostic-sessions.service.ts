import { Inject, Injectable } from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import { CATALOG_LOOKUP, type CatalogLookup } from "../../catalog/catalog.contract.js";
import { QUESTION_READER, type QuestionReader } from "../../questions/questions.contract.js";
import {
  PRELIMINARY_LEVELS_KEY,
  SETTINGS_READER,
  type SettingsReader,
} from "../../settings/settings.contract.js";
import {
  ExamNotAvailable,
  FullDiagnosticAlreadyCompleted,
  MiniDiagnosticAlreadyCompleted,
  NoQuestionsAvailable,
} from "../domain/assessment.errors.js";
import {
  FULL_DIAGNOSTIC_DEFAULTS,
  MINI_DIAGNOSTIC_DEFAULTS,
  SCORING_VERSION,
} from "../domain/assessment-config.js";
import {
  type Blueprint,
  type DiagnosticBlueprintType,
  effectiveDomainWeights,
} from "../domain/blueprint.js";
import { type PlanDomain, planDiagnostic } from "../domain/diagnostic-plan.js";
import {
  ASSESSMENT_STORE,
  type AssessmentStore,
  BLUEPRINT_STORE,
  type BlueprintStore,
  type Session,
} from "../domain/ports.js";

/** The sessions planned up front from a diagnostic recipe. */
export type DiagnosticKind = "MINI_DIAGNOSTIC" | "FULL_DIAGNOSTIC" | "FULL_REASSESSMENT";

/** How each diagnostic is planned (PRD §7–§8, OPEN_QUESTIONS.md #9a, #10, #12g). */
interface Diagnostic {
  type: DiagnosticKind;
  /** Whose active blueprint sets the size and domain weights. */
  blueprintType: DiagnosticBlueprintType;
  defaults: { questionCount: number; targetDifficulty: number };
  /** The size covers questions already answered: the diagnosis continues, never restarts. */
  continuesEvidence: boolean;
  /** Questions seen before may fill a skill's share once its unseen ones run out. */
  reusesSeenQuestions: boolean;
  /** One completed session ends this kind for good; null when it may be taken again. */
  alreadyCompleted: ((sessionId: string) => Error) | null;
}

const DIAGNOSTICS: Record<DiagnosticKind, Diagnostic> = {
  MINI_DIAGNOSTIC: {
    type: "MINI_DIAGNOSTIC",
    blueprintType: "MINI_DIAGNOSTIC",
    defaults: MINI_DIAGNOSTIC_DEFAULTS,
    continuesEvidence: false,
    reusesSeenQuestions: false,
    alreadyCompleted: (sessionId) => new MiniDiagnosticAlreadyCompleted(sessionId),
  },
  FULL_DIAGNOSTIC: {
    type: "FULL_DIAGNOSTIC",
    blueprintType: "FULL_DIAGNOSTIC",
    defaults: FULL_DIAGNOSTIC_DEFAULTS,
    continuesEvidence: true,
    reusesSeenQuestions: false,
    alreadyCompleted: (sessionId) => new FullDiagnosticAlreadyCompleted(sessionId),
  },
  // The whole exam measured again with the full diagnostic's recipe, so the
  // two compare; its gate is checked by FullReassessmentService.
  FULL_REASSESSMENT: {
    type: "FULL_REASSESSMENT",
    blueprintType: "FULL_DIAGNOSTIC",
    defaults: FULL_DIAGNOSTIC_DEFAULTS,
    continuesEvidence: false,
    reusesSeenQuestions: true,
    alreadyCompleted: null,
  },
};

/**
 * Opens diagnostic sessions: resumes the open one of a kind, or plans and
 * creates a new one from the exam's published taxonomy and active blueprint.
 * Callers check access and eligibility first.
 */
@Injectable()
export class DiagnosticSessions {
  constructor(
    @Inject(ASSESSMENT_STORE) private readonly store: AssessmentStore,
    @Inject(BLUEPRINT_STORE) private readonly blueprints: BlueprintStore,
    @Inject(CATALOG_LOOKUP) private readonly catalog: CatalogLookup,
    @Inject(QUESTION_READER) private readonly questions: QuestionReader,
    @Inject(SETTINGS_READER) private readonly settings: SettingsReader,
    @InjectPinoLogger(DiagnosticSessions.name) private readonly logger: PinoLogger,
  ) {}

  async assertExamActive(examId: string): Promise<void> {
    if ((await this.catalog.examStatus(examId)) !== "ACTIVE") throw new ExamNotAvailable();
  }

  /** Resumes the open session of this kind, or plans and creates one. */
  async open(
    studentId: string,
    examId: string,
    kindName: DiagnosticKind,
  ): Promise<{ session: Session; created: boolean }> {
    const kind = DIAGNOSTICS[kindName];
    const previous = await this.store.sessionsFor(studentId, examId, kind.type);
    const open = previous.find((s) => s.status === "CREATED" || s.status === "IN_PROGRESS");
    if (open) return { session: open, created: false };
    const completed = previous.find((s) => s.status === "COMPLETED");
    if (completed && kind.alreadyCompleted) throw kind.alreadyCompleted(completed.id);

    const taxonomy = await this.catalog.publishedTaxonomy(examId);
    if (!taxonomy) throw new ExamNotAvailable();
    const blueprint = await this.usableBlueprint(
      examId,
      kind.blueprintType,
      taxonomy.taxonomyVersionId,
    );
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
    const candidates = (await this.questions.publishedCandidates(taxonomy.taxonomyVersionId))
      .filter((c) => kind.reusesSeenQuestions || !asked.has(c.questionId))
      .map((c) => (asked.has(c.questionId) ? { ...c, seen: true } : c));
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
}
