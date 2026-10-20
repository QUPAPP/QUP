import { Inject, Injectable } from "@nestjs/common";
import {
  aggregateSkill,
  gapSeverity,
  initialNodeMastery,
  MASTERY_CONFIG_V1,
  type MasteryState,
  rankGaps,
} from "@qup/adaptive-engine";

import { EXAM_ACCESS, type ExamAccess } from "../../billing/billing.contract.js";
import { CATALOG_LOOKUP, type CatalogLookup } from "../../catalog/catalog.contract.js";
import { ProfileExamNotAvailable, SkillProfileRequiresAccess } from "../domain/mastery.errors.js";
import {
  DrizzleMasteryReader,
  type StoredNodeState,
} from "../infrastructure/drizzle-mastery-reader.js";

/** The same config the writer computes with (mastery-writer.ts). */
const CONFIG = MASTERY_CONFIG_V1;

interface ProfileNode {
  state: MasteryState;
  /** Null until measured: the prior is never shown as a level (ADAPTIVE_ENGINE.md §2). */
  mastery: number | null;
  coverage: number;
  evidenceCount: number;
}

export interface SkillProfile {
  exam: { id: string; nameAr: string };
  summary: {
    skills: number;
    assessed: number;
    gaps: number;
    readyForReassessment: number;
    mastered: number;
  };
  domains: {
    id: string;
    name: string;
    skills: (ProfileNode & {
      id: string;
      name: string;
      gapSeverity: number | null;
      subskills: (ProfileNode & { id: string; name: string })[];
    })[];
  }[];
  gaps: {
    skillId: string;
    skillName: string;
    domainName: string;
    state: MasteryState;
    severity: number;
  }[];
}

const view = (node: {
  state: MasteryState;
  masteryScore: number;
  coverageScore: number;
  evidenceCount: number;
}): ProfileNode => ({
  state: node.state,
  mastery: node.evidenceCount === 0 ? null : node.masteryScore,
  coverage: node.coverageScore,
  evidenceCount: node.evidenceCount,
});

/**
 * A student's skill profile (PRD §6 "Skill Profile → Ranked Gaps"): every
 * skill of the exam's published taxonomy, read from the student's own states,
 * with the engine's gap and aggregation rules. Paid (PRD §7).
 */
@Injectable()
export class SkillProfileService {
  constructor(
    @Inject(CATALOG_LOOKUP) private readonly catalog: CatalogLookup,
    @Inject(EXAM_ACCESS) private readonly access: ExamAccess,
    private readonly reader: DrizzleMasteryReader,
  ) {}

  async profile(studentId: string, examId: string): Promise<SkillProfile> {
    if ((await this.catalog.examStatus(examId)) !== "ACTIVE") throw new ProfileExamNotAvailable();
    if (!(await this.access.hasExamAccess(studentId, examId))) {
      throw new SkillProfileRequiresAccess();
    }
    const taxonomy = await this.catalog.profileTaxonomy(examId);
    if (!taxonomy) throw new ProfileExamNotAvailable();

    const states = await this.reader.statesFor(studentId, examId);
    const bySkill = new Map(states.filter((s) => s.skillId).map((s) => [s.skillId, s]));
    const bySubskill = new Map(states.filter((s) => s.subskillId).map((s) => [s.subskillId, s]));
    const unmeasured = initialNodeMastery(CONFIG);
    const stateOf = (stored: StoredNodeState | undefined) => stored ?? unmeasured;

    let order = 0;
    const gaps: (SkillProfile["gaps"][number] & { order: number })[] = [];
    const domains = taxonomy.domains.map((domain) => ({
      id: domain.id,
      name: domain.name,
      skills: domain.skills.map((skill) => {
        const settings = {
          masteryThreshold: skill.masteryThreshold,
          minCoverage: skill.minCoverage,
        };
        const subskills = skill.subskills.map((subskill) => ({
          subskill,
          node: stateOf(bySubskill.get(subskill.id)),
        }));
        // §14: a skill with subskills is defined by them.
        const node =
          subskills.length > 0
            ? aggregateSkill(
                subskills.map(({ subskill, node: child }) => ({
                  node: child,
                  weight: subskill.weight,
                })),
                settings,
                CONFIG,
              )
            : stateOf(bySkill.get(skill.id));
        const threshold = skill.masteryThreshold ?? CONFIG.states.defaultMasteryThreshold;
        const severity = gapSeverity(node, threshold, CONFIG);
        const skillOrder = order++;
        if (severity !== null) {
          gaps.push({
            skillId: skill.id,
            skillName: skill.name,
            domainName: domain.name,
            state: node.state,
            severity,
            order: skillOrder,
          });
        }
        return {
          id: skill.id,
          name: skill.name,
          ...view(node),
          gapSeverity: severity,
          subskills: subskills.map(({ subskill, node: child }) => ({
            id: subskill.id,
            name: subskill.name,
            ...view(child),
          })),
        };
      }),
    }));

    const allSkills = domains.flatMap((domain) => domain.skills);
    const count = (state: MasteryState) =>
      allSkills.filter((skill) => skill.state === state).length;
    const examName = (await this.catalog.examNames([examId])).get(examId) ?? "";
    return {
      exam: { id: examId, nameAr: examName },
      summary: {
        skills: allSkills.length,
        assessed: allSkills.length - count("UNASSESSED"),
        gaps: gaps.length,
        readyForReassessment: count("READY_FOR_REASSESSMENT"),
        mastered: count("MASTERED"),
      },
      domains,
      gaps: rankGaps(gaps).map(({ order: _order, ...gap }) => gap),
    };
  }
}
