import { Inject, Injectable } from "@nestjs/common";

import { EXAM_ACCESS, type ExamAccess } from "../../billing/billing.contract.js";
import { CATALOG_LOOKUP, type CatalogLookup } from "../../catalog/catalog.contract.js";
import {
  SKILL_STANDING_READER,
  type SkillStanding,
  type SkillStandingReader,
  type StandingSkill,
  standingSummary,
} from "../../mastery/mastery.contract.js";
import { DASHBOARD_DEFAULTS } from "../domain/assessment-config.js";
import { type NextStep, nextStep } from "../domain/next-step.js";
import { ASSESSMENT_STORE, type AssessmentStore } from "../domain/ports.js";

const DAY_MS = 86_400_000;
/** Measured too little or below readiness without being a gap: training still helps. */
const NEEDS_EVIDENCE = new Set(["UNASSESSED", "UNCERTAIN", "DEVELOPING"]);

export interface ExamProgressCard {
  exam: { id: string; nameAr: string };
  hasAccess: boolean;
  nextStep: NextStep;
  /** Paid only (PRD §7): the skill map is part of the package. */
  standing: {
    summary: ReturnType<typeof standingSummary>;
    strengths: { skillName: string; state: string; mastery: number }[];
    gaps: { skillName: string; severity: number }[];
    improvements: { nodeName: string; before: number; after: number }[];
  } | null;
}

/**
 * The student dashboard (UI_BRAND.md "Student Dashboard Principle"): per exam
 * the student has started or paid for — where they stand, their strengths and
 * gaps, what improved this week, and the one next step (PRD §6 journey).
 */
@Injectable()
export class StudentDashboardService {
  constructor(
    @Inject(ASSESSMENT_STORE) private readonly store: AssessmentStore,
    @Inject(CATALOG_LOOKUP) private readonly catalog: CatalogLookup,
    @Inject(EXAM_ACCESS) private readonly access: ExamAccess,
    @Inject(SKILL_STANDING_READER) private readonly standings: SkillStandingReader,
  ) {}

  async dashboard(studentId: string, now = new Date()): Promise<ExamProgressCard[]> {
    const [exams, activity] = await Promise.all([
      this.catalog.activeExams(),
      this.store.activityOf(studentId),
    ]);
    const cards = await Promise.all(
      exams.map(async (exam): Promise<ExamProgressCard | null> => {
        const hasAccess = await this.access.hasExamAccess(studentId, exam.id);
        if (!hasAccess && !activity.examIds.has(exam.id)) return null;

        const completed = (type: string) =>
          activity.completed.some((c) => c.examId === exam.id && c.type === type);
        const open = activity.open.find((session) => session.examId === exam.id) ?? null;
        const standing = hasAccess ? await this.standings.standing(studentId, exam.id) : null;
        const skills = standing?.domains.flatMap((domain) => domain.skills) ?? [];
        const gaps = rankedGaps(skills);
        const ready = skills.find((skill) => skill.state === "READY_FOR_REASSESSMENT");

        return {
          exam: { id: exam.id, nameAr: exam.nameAr },
          hasAccess,
          nextStep: nextStep({
            hasAccess,
            openSession: open ? { id: open.id, type: open.type } : null,
            miniCompleted: completed("MINI_DIAGNOSTIC"),
            fullCompleted: completed("FULL_DIAGNOSTIC"),
            readySkill: ready ? { id: ready.id, name: ready.name } : null,
            // Connected to the gate with the re-diagnostic's service (next commit).
            fullReassessmentEligible: false,
            trainable: {
              any: skills.some(
                (skill) => skill.gapSeverity !== null || NEEDS_EVIDENCE.has(skill.state),
              ),
              topGapName: gaps[0]?.name ?? null,
            },
          }),
          standing: standing ? await this.standingView(studentId, standing, gaps, now) : null,
        };
      }),
    );
    return cards.filter((card): card is ExamProgressCard => card !== null);
  }

  private async standingView(
    studentId: string,
    standing: SkillStanding,
    gaps: StandingSkill[],
    now: Date,
  ): Promise<NonNullable<ExamProgressCard["standing"]>> {
    const skills = standing.domains.flatMap((domain) => domain.skills);
    const names = new Map<string, string>();
    for (const skill of skills) {
      names.set(skill.id, skill.name);
      for (const sub of skill.subskills) names.set(sub.id, sub.name);
    }
    const since = new Date(now.getTime() - DASHBOARD_DEFAULTS.improvementWindowDays * DAY_MS);
    // The nodes the profile reports: a skill with subskills is read through them (§14).
    const changes = await this.standings.recentChanges(
      studentId,
      {
        skillIds: skills.filter((skill) => skill.subskills.length === 0).map((skill) => skill.id),
        subskillIds: skills.flatMap((skill) => skill.subskills.map((sub) => sub.id)),
      },
      since,
    );

    return {
      summary: standingSummary(skills),
      // Mastered first, then the strongest measured skills that are not gaps.
      strengths: skills
        .filter(
          (skill) =>
            skill.mastery !== null && skill.gapSeverity === null && skill.state !== "UNCERTAIN",
        )
        .sort(
          (a, b) =>
            Number(b.state === "MASTERED") - Number(a.state === "MASTERED") ||
            (b.mastery ?? 0) - (a.mastery ?? 0),
        )
        .slice(0, DASHBOARD_DEFAULTS.strengths)
        .map((skill) => ({
          skillName: skill.name,
          state: skill.state,
          mastery: skill.mastery ?? 0,
        })),
      gaps: gaps
        .slice(0, DASHBOARD_DEFAULTS.gaps)
        .map((skill) => ({ skillName: skill.name, severity: skill.gapSeverity ?? 0 })),
      improvements: changes
        .filter((change) => change.after > change.before)
        .sort((a, b) => b.after - b.before - (a.after - a.before))
        .slice(0, DASHBOARD_DEFAULTS.improvements)
        .map((change) => ({
          nodeName: names.get(change.subskillId ?? change.skillId ?? "") ?? "",
          before: change.before,
          after: change.after,
        })),
    };
  }
}

/** Gaps, largest first; equal severities keep the taxonomy's display order (as the profile). */
function rankedGaps(skills: readonly StandingSkill[]): StandingSkill[] {
  return skills
    .map((skill, order) => ({ skill, order }))
    .filter(({ skill }) => skill.gapSeverity !== null)
    .sort((a, b) => (b.skill.gapSeverity ?? 0) - (a.skill.gapSeverity ?? 0) || a.order - b.order)
    .map(({ skill }) => skill);
}
