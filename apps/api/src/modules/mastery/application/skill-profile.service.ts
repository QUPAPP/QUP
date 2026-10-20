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
import type {
  SkillStanding,
  SkillStandingReader,
  StandingNode,
  StandingSkill,
} from "../mastery.contract.js";

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

const view = (node: StandingNode): ProfileNode => ({
  state: node.state,
  mastery: node.mastery,
  coverage: node.coverage,
  evidenceCount: node.evidenceCount,
});

function standingNode(
  id: string,
  name: string,
  node: {
    state: MasteryState;
    masteryScore: number;
    confidenceScore: number;
    coverageScore: number;
    evidenceCount: number;
  },
  threshold: number | null,
): StandingNode {
  return {
    id,
    name,
    state: node.state,
    mastery: node.evidenceCount === 0 ? null : node.masteryScore,
    confidence: node.confidenceScore,
    coverage: node.coverageScore,
    evidenceCount: node.evidenceCount,
    gapSeverity: gapSeverity(node, threshold ?? CONFIG.states.defaultMasteryThreshold, CONFIG),
  };
}

/**
 * A student's skill profile (PRD §6 "Skill Profile → Ranked Gaps"): every
 * skill of the exam's published taxonomy, read from the student's own states,
 * with the engine's gap and aggregation rules. The profile is paid (PRD §7);
 * the standing behind it is the mastery module's read contract.
 */
@Injectable()
export class SkillProfileService implements SkillStandingReader {
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
    const standing = await this.standing(studentId, examId);
    if (!standing) throw new ProfileExamNotAvailable();

    let order = 0;
    const gaps: (SkillProfile["gaps"][number] & { order: number })[] = [];
    const domains = standing.domains.map((domain) => ({
      id: domain.id,
      name: domain.name,
      skills: domain.skills.map((skill) => {
        const skillOrder = order++;
        if (skill.gapSeverity !== null) {
          gaps.push({
            skillId: skill.id,
            skillName: skill.name,
            domainName: domain.name,
            state: skill.state,
            severity: skill.gapSeverity,
            order: skillOrder,
          });
        }
        return {
          id: skill.id,
          name: skill.name,
          ...view(skill),
          gapSeverity: skill.gapSeverity,
          subskills: skill.subskills.map((subskill) => ({
            id: subskill.id,
            name: subskill.name,
            ...view(subskill),
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

  async standing(studentId: string, examId: string): Promise<SkillStanding | null> {
    const taxonomy = await this.catalog.profileTaxonomy(examId);
    if (!taxonomy) return null;

    const states = await this.reader.statesFor(studentId, examId);
    const bySkill = new Map(states.filter((s) => s.skillId).map((s) => [s.skillId, s]));
    const bySubskill = new Map(states.filter((s) => s.subskillId).map((s) => [s.subskillId, s]));
    const unmeasured = initialNodeMastery(CONFIG);
    const stateOf = (stored: StoredNodeState | undefined) => stored ?? unmeasured;

    return {
      domains: taxonomy.domains.map((domain) => ({
        id: domain.id,
        name: domain.name,
        weight: domain.weight,
        skills: domain.skills.map((skill): StandingSkill => {
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
                  { masteryThreshold: skill.masteryThreshold, minCoverage: skill.minCoverage },
                  CONFIG,
                )
              : stateOf(bySkill.get(skill.id));
          return {
            ...standingNode(skill.id, skill.name, node, skill.masteryThreshold),
            weight: skill.weight,
            priorityWeight: skill.priorityWeight,
            prerequisiteSkillIds: skill.prerequisiteSkillIds,
            subskills: subskills.map(({ subskill, node: child }) =>
              standingNode(subskill.id, subskill.name, child, subskill.masteryThreshold),
            ),
          };
        }),
      })),
    };
  }
}
