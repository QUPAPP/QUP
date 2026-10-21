import { Inject, Injectable } from "@nestjs/common";
import { EXAM_ACCESS, type ExamAccess } from "../../billing/billing.contract.js";
import { CATALOG_LOOKUP, type CatalogLookup } from "../../catalog/catalog.contract.js";
import { QUESTION_READER, type QuestionReader } from "../../questions/questions.contract.js";
import {
  FULL_REASSESSMENT_GATE_KEY,
  SETTINGS_READER,
  type SettingsReader,
} from "../../settings/settings.contract.js";
import {
  AssessmentNotCompleted,
  AssessmentNotFound,
  FullReassessmentNotEligible,
  FullReassessmentRequiresAccess,
} from "../domain/assessment.errors.js";
import {
  compareMeasurements,
  type FullReassessmentState,
  fullReassessmentStatus,
} from "../domain/full-reassessment.js";
import { ASSESSMENT_STORE, type AssessmentStore, type Session } from "../domain/ports.js";
import type { MeasuredItem } from "../domain/preliminary-result.js";
import { DiagnosticSessions } from "./diagnostic-sessions.service.js";
import { measureItems } from "./measured-items.js";

/** The sessions that measure the whole exam. */
const FULL_MEASUREMENTS = ["FULL_DIAGNOSTIC", "FULL_REASSESSMENT"] as const;

export interface FullReassessmentView {
  state: FullReassessmentState;
  openSessionId: string | null;
  lastMeasuredAt: Date | null;
  availableAt: Date | null;
  trainingAttempts: { done: number; required: number };
  cooldownDays: number;
}

export interface FullReassessmentResult {
  score: { correct: number; total: number };
  previous: {
    type: Session["type"];
    completedAt: Date;
    correct: number;
    total: number;
  } | null;
  skills: {
    skillId: string;
    name: string;
    correct: number;
    total: number;
    previousCorrect: number | null;
    previousTotal: number | null;
  }[];
}

const isOpen = (session: Session) =>
  session.status === "CREATED" || session.status === "IN_PROGRESS";

/** The latest completed session of the list, by completion time. */
function latestCompleted(sessions: readonly Session[], before?: Date): Session | null {
  let latest: Session | null = null;
  for (const session of sessions) {
    const at = session.completedAt;
    if (session.status !== "COMPLETED" || !at) continue;
    if (before && at >= before) continue;
    if (!latest?.completedAt || at > latest.completedAt) latest = session;
  }
  return latest;
}

/**
 * The full re-diagnostic (PRD §6, §8; WORKFLOWS.md §6): the whole exam measured
 * again once the gate allows, compared with the previous full measurement.
 * Assumed details: OPEN_QUESTIONS.md #12g.
 */
@Injectable()
export class FullReassessmentService {
  constructor(
    @Inject(ASSESSMENT_STORE) private readonly store: AssessmentStore,
    @Inject(EXAM_ACCESS) private readonly access: ExamAccess,
    @Inject(SETTINGS_READER) private readonly settings: SettingsReader,
    @Inject(CATALOG_LOOKUP) private readonly catalog: CatalogLookup,
    @Inject(QUESTION_READER) private readonly questions: QuestionReader,
    private readonly diagnostics: DiagnosticSessions,
  ) {}

  async status(studentId: string, examId: string): Promise<FullReassessmentView> {
    await this.diagnostics.assertExamActive(examId);
    return this.statusOf(studentId, examId);
  }

  /** Starts — or resumes — the re-diagnostic. An open one is always resumable. */
  async start(studentId: string, examId: string): Promise<{ session: Session; created: boolean }> {
    await this.diagnostics.assertExamActive(examId);
    const status = await this.statusOf(studentId, examId);
    switch (status.state) {
      case "REQUIRES_ACCESS":
        throw new FullReassessmentRequiresAccess();
      case "FULL_DIAGNOSTIC_REQUIRED":
      case "WAITING":
        throw new FullReassessmentNotEligible(
          status.state,
          status.availableAt,
          Math.max(0, status.trainingAttempts.required - status.trainingAttempts.done),
        );
      default:
        // OPEN resumes, ELIGIBLE plans a new session.
        return this.diagnostics.open(studentId, examId, "FULL_REASSESSMENT");
    }
  }

  async result(studentId: string, sessionId: string): Promise<FullReassessmentResult> {
    const session = await this.store.findSession(sessionId);
    if (session?.studentId !== studentId || session.type !== "FULL_REASSESSMENT") {
      throw new AssessmentNotFound();
    }
    if (session.status !== "COMPLETED") throw new AssessmentNotCompleted();

    const current = await measureItems(await this.store.items(sessionId), this.deps());
    const previousSession = latestCompleted(
      await this.fullMeasurements(studentId, session.examId),
      session.createdAt,
    );
    const previous = previousSession ? await this.baseline(previousSession) : null;
    const names = new Map([...current.skillNames, ...(previous?.skillNames ?? [])]);
    const comparison = compareMeasurements(current.measured, previous?.measured ?? null);

    const order = await this.skillOrder(session.examId);
    const rank = (skillId: string) => order.get(skillId) ?? Number.MAX_SAFE_INTEGER;
    return {
      score: comparison.score,
      previous:
        previousSession?.completedAt && comparison.previous
          ? {
              type: previousSession.type,
              completedAt: previousSession.completedAt,
              ...comparison.previous,
            }
          : null,
      skills: [...comparison.skills]
        .sort((a, b) => rank(a.skillId) - rank(b.skillId))
        .map((skill) => ({ ...skill, name: names.get(skill.skillId) ?? "" })),
    };
  }

  private async statusOf(studentId: string, examId: string): Promise<FullReassessmentView> {
    const [measurements, gate, hasAccess] = await Promise.all([
      this.fullMeasurements(studentId, examId),
      this.settings.current(FULL_REASSESSMENT_GATE_KEY),
      this.access.hasExamAccess(studentId, examId),
    ]);
    const open = measurements.find((s) => s.type === "FULL_REASSESSMENT" && isOpen(s)) ?? null;
    const lastMeasuredAt = latestCompleted(measurements)?.completedAt ?? null;
    const done = lastMeasuredAt
      ? await this.store.answeredAttemptsSince(
          studentId,
          examId,
          "ADAPTIVE_TRAINING",
          lastMeasuredAt,
        )
      : 0;
    const decision = fullReassessmentStatus({
      hasAccess,
      openSessionId: open?.id ?? null,
      lastMeasuredAt,
      trainingAttemptsSince: done,
      now: new Date(),
      gate: gate.value,
    });
    return {
      state: decision.state,
      openSessionId: open?.id ?? null,
      lastMeasuredAt,
      availableAt: decision.availableAt,
      trainingAttempts: { done, required: gate.value.minTrainingAttempts },
      cooldownDays: gate.value.cooldownDays,
    };
  }

  private async fullMeasurements(studentId: string, examId: string): Promise<Session[]> {
    const lists = await Promise.all(
      FULL_MEASUREMENTS.map((type) => this.store.sessionsFor(studentId, examId, type)),
    );
    return lists.flat();
  }

  /**
   * What the previous measurement asked. The full diagnostic continued the
   * mini one (OPEN_QUESTIONS.md #9a), so together they are the first diagnosis.
   */
  private async baseline(
    previous: Session,
  ): Promise<{ measured: MeasuredItem[]; skillNames: Map<string, string> }> {
    const sessions = [previous];
    if (previous.type === "FULL_DIAGNOSTIC") {
      const minis = await this.store.sessionsFor(
        previous.studentId,
        previous.examId,
        "MINI_DIAGNOSTIC",
      );
      sessions.push(...minis.filter((s) => s.status === "COMPLETED"));
    }
    const items = (await Promise.all(sessions.map((s) => this.store.items(s.id)))).flat();
    return measureItems(items, this.deps());
  }

  /** Display order of the exam's skills: domains, then skills, as the taxonomy lists them. */
  private async skillOrder(examId: string): Promise<Map<string, number>> {
    const taxonomy = await this.catalog.publishedTaxonomy(examId);
    const ids = taxonomy?.domains.flatMap((domain) => domain.skills.map((skill) => skill.id)) ?? [];
    return new Map(ids.map((id, index) => [id, index]));
  }

  private deps() {
    return { questions: this.questions, catalog: this.catalog };
  }
}
