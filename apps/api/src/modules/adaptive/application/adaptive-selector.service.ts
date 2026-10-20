import { Inject, Injectable } from "@nestjs/common";
import {
  ADAPTIVE_ENGINE_VERSION,
  chooseTarget,
  examWeightFactors,
  pickCandidate,
  rankCandidates,
  SELECTION_CONFIG_V1,
  type SelectionCandidate,
  type TargetSkill,
  targetDifficulty,
} from "@qup/adaptive-engine";

import type { DbExecutor } from "../../../infrastructure/database/executor.js";
import { CATALOG_LOOKUP, type CatalogLookup } from "../../catalog/catalog.contract.js";
import {
  SKILL_STANDING_READER,
  type SkillStandingReader,
  type StandingNode,
  type StandingSkill,
} from "../../mastery/mastery.contract.js";
import {
  QUESTION_READER,
  type QuestionCandidate,
  type QuestionReader,
} from "../../questions/questions.contract.js";
import {
  ADAPTIVE_RANDOM,
  type AdaptiveDecision,
  type AdaptiveSelector,
  type TrainingContext,
} from "../adaptive.contract.js";
import { DrizzleDecisionStore } from "../infrastructure/drizzle-decision-store.js";

const CONFIG = SELECTION_CONFIG_V1;
/** How many scored candidates a decision keeps for the audit. */
const CANDIDATE_SNAPSHOT_SIZE = 10;

/**
 * WORKFLOWS.md §4 adaptive loop, one step: load where the student stands, the
 * exam's taxonomy and the questions they have not seen, and let the engine's
 * pure rules choose (ADAPTIVE_ENGINE.md §15–§20). No LLM takes part (§21).
 */
@Injectable()
export class AdaptiveSelectorService implements AdaptiveSelector {
  constructor(
    @Inject(SKILL_STANDING_READER) private readonly standing: SkillStandingReader,
    @Inject(CATALOG_LOOKUP) private readonly catalog: CatalogLookup,
    @Inject(QUESTION_READER) private readonly questions: QuestionReader,
    @Inject(ADAPTIVE_RANDOM) private readonly random: () => number,
    private readonly decisions: DrizzleDecisionStore,
  ) {}

  async decide(context: TrainingContext): Promise<AdaptiveDecision | null> {
    const [standing, published] = await Promise.all([
      this.standing.standing(context.studentId, context.examId),
      this.catalog.publishedTaxonomy(context.examId),
    ]);
    if (!standing || !published) return null;

    const skills = standing.domains.flatMap((domain) => domain.skills);
    const skillOfSubskill = new Map(
      skills.flatMap((skill) => skill.subskills.map((sub) => [sub.id, skill.id] as const)),
    );
    const bySkill = new Map<string, QuestionCandidate[]>();
    for (const candidate of await this.questions.publishedCandidates(published.taxonomyVersionId)) {
      if (context.askedQuestionIds.has(candidate.questionId)) continue;
      const skillId =
        candidate.primarySkillId ??
        (candidate.primarySubskillId
          ? skillOfSubskill.get(candidate.primarySubskillId)
          : undefined);
      if (!skillId) continue;
      bySkill.set(skillId, [...(bySkill.get(skillId) ?? []), candidate]);
    }

    const factors = examWeightFactors(
      standing.domains.map((domain) => ({
        weight: domain.weight,
        skills: domain.skills.map((skill) => ({ id: skill.id, weight: skill.weight })),
      })),
    );
    const targets: TargetSkill[] = skills.map((skill, order) => ({
      id: skill.id,
      order,
      state: skill.state,
      severity: skill.gapSeverity,
      examWeightFactor: factors.get(skill.id) ?? 0,
      priorityWeight: skill.priorityWeight,
      prerequisiteIds: skill.prerequisiteSkillIds,
      hasCandidates: (bySkill.get(skill.id)?.length ?? 0) > 0,
    }));
    const choice = chooseTarget({ skills: targets, current: context.current }, CONFIG);
    const target = skills.find((skill) => skill.id === choice?.skillId);
    if (!choice || !target) return null;

    const recent = context.current?.skillId === target.id ? context.current.recentResults : [];
    const difficulty = targetDifficulty(target.mastery, recent, CONFIG);
    const { scored, widened } = rankCandidates(
      (bySkill.get(target.id) ?? []).map((candidate) =>
        toSelectionCandidate(candidate, nodeOf(target, candidate)),
      ),
      difficulty.value,
      CONFIG,
    );
    const picked = pickCandidate(scored, this.random, CONFIG);
    if (!picked) return null;

    return {
      studentId: context.studentId,
      targetSkillId: target.id,
      reasons: [
        choice.reason,
        ...difficulty.reasons,
        ...(widened ? ["DIFFICULTY_BAND_WIDENED"] : []),
      ],
      masterySnapshot: target.mastery,
      confidenceSnapshot: target.confidence,
      targetDifficulty: difficulty.value,
      candidates: scored.slice(0, CANDIDATE_SNAPSHOT_SIZE).map((c) => ({
        questionVersionId: c.questionVersionId,
        difficulty: c.difficulty,
        score: c.score,
      })),
      selectedQuestionVersionId: picked.questionVersionId,
      engineVersion: ADAPTIVE_ENGINE_VERSION,
      configVersion: CONFIG.configVersion,
    };
  }

  async planReassessment(input: {
    studentId: string;
    examId: string;
    skillId: string;
    askedQuestionIds: ReadonlySet<string>;
    size: number;
  }): Promise<string[]> {
    const [standing, published] = await Promise.all([
      this.standing.standing(input.studentId, input.examId),
      this.catalog.publishedTaxonomy(input.examId),
    ]);
    const skill = standing?.domains
      .flatMap((domain) => domain.skills)
      .find((candidate) => candidate.id === input.skillId);
    if (!skill || !published) return [];

    const subskillIds = new Set(skill.subskills.map((sub) => sub.id));
    const onSkill = (await this.questions.publishedCandidates(published.taxonomyVersionId)).filter(
      (c) =>
        c.primarySkillId === skill.id ||
        (c.primarySubskillId !== null && subskillIds.has(c.primarySubskillId)),
    );
    const target = targetDifficulty(skill.mastery, [], CONFIG).value;
    const nearest = (a: QuestionCandidate, b: QuestionCandidate) =>
      Math.abs(a.difficulty - target) - Math.abs(b.difficulty - target) ||
      a.questionVersionId.localeCompare(b.questionVersionId);
    const unseen = onSkill.filter((c) => !input.askedQuestionIds.has(c.questionId)).sort(nearest);
    const seen = onSkill.filter((c) => input.askedQuestionIds.has(c.questionId)).sort(nearest);
    // One version per logical question.
    const chosen = new Map<string, string>();
    for (const candidate of [...unseen, ...seen]) {
      if (chosen.size >= input.size) break;
      if (!chosen.has(candidate.questionId)) {
        chosen.set(candidate.questionId, candidate.questionVersionId);
      }
    }
    return [...chosen.values()];
  }

  recordDecision(executor: DbExecutor, decision: AdaptiveDecision): Promise<string> {
    return this.decisions.record(executor, decision);
  }

  decisionDetails(decisionIds: readonly string[]) {
    return this.decisions.details(decisionIds);
  }

  targetsOf(decisionIds: readonly string[]) {
    return this.decisions.targets(decisionIds);
  }
}

/** The node a question primarily measures: one of the target's subskills, or the target itself. */
function nodeOf(target: StandingSkill, candidate: QuestionCandidate): StandingNode {
  return target.subskills.find((sub) => sub.id === candidate.primarySubskillId) ?? target;
}

function toSelectionCandidate(
  candidate: QuestionCandidate,
  node: StandingNode,
): SelectionCandidate {
  return {
    questionVersionId: candidate.questionVersionId,
    difficulty: candidate.difficulty,
    nodeSeverity: node.gapSeverity,
    nodeMeasured: node.evidenceCount > 0,
    nodeCoverage: node.coverage,
  };
}
