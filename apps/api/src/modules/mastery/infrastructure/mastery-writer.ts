import { Injectable } from "@nestjs/common";
import {
  ALGORITHM_VERSION,
  applyEvidence,
  type EligibleAttempt,
  initialNodeMastery,
  type LearningNodeMapping,
  MASTERY_CONFIG_V1,
  type MasteryConfig,
  type MasteryEventDraft,
  type MasteryState,
  type NodeMastery,
} from "@qup/adaptive-engine";
import { sql } from "drizzle-orm";

import type { DbTransaction } from "../../../infrastructure/database/executor.js";
import type { NodeSettings } from "../../catalog/catalog.contract.js";

/**
 * Persists Mastery Engine results (ADAPTIVE_ENGINE.md §22).
 *
 * Runs inside the caller's transaction — the one that records the attempt —
 * so an attempt and its evidence commit or roll back together (ARCHITECTURE.md
 * §8). Concurrency, per learning node:
 *   - the state row is locked (SELECT … FOR UPDATE) before the engine reads it,
 *     so two attempts on the same skill cannot both start from the same prior;
 *   - rows are locked in a fixed order (by node id), so two attempts sharing
 *     skills cannot deadlock;
 *   - `row_version` is checked on write as a second guard;
 *   - mastery_events is unique per (attempt, node): the same attempt can never
 *     be counted twice for a node, even on a retried request.
 */

export interface EvidenceTarget {
  skillId: string | null;
  subskillId: string | null;
  mapping: LearningNodeMapping;
  settings: NodeSettings;
}

export interface AttemptEvidenceInput {
  studentId: string;
  examId: string;
  attempt: EligibleAttempt;
  targets: readonly EvidenceTarget[];
}

export interface AppliedEvidence {
  skillId: string | null;
  subskillId: string | null;
  event: MasteryEventDraft;
  state: MasteryState;
}

/** Column scales, matching numeric(p, s) in @qup/db. */
const SCALE = { priors: 6, scores: 5, evidence: 6, difficulty: 3, weight: 4 } as const;
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

// A type alias (not an interface) so it satisfies drizzle's Record<string, unknown> constraint.
type StateRow = {
  id: string;
  alpha: string;
  beta: string;
  mastery_score: string;
  confidence_score: string;
  evidence_count: number;
  distinct_question_count: number;
  coverage_score: string;
  state: MasteryState;
  row_version: number;
};

@Injectable()
export class MasteryWriter {
  private readonly config: MasteryConfig = MASTERY_CONFIG_V1;

  async applyAttemptEvidence(
    tx: DbTransaction,
    input: AttemptEvidenceInput,
  ): Promise<AppliedEvidence[]> {
    const ordered = [...input.targets].sort((a, b) => nodeKey(a).localeCompare(nodeKey(b)));
    const applied: AppliedEvidence[] = [];

    for (const target of ordered) {
      const row = await this.lockState(tx, input, target);
      const prior = toNodeMastery(row);
      const { next, event } = applyEvidence({
        prior,
        settings: target.settings,
        attempt: input.attempt,
        mapping: target.mapping,
        config: this.config,
      });
      if (!event) continue; // skip, or correct only after a reveal: no evidence (§8, §10)

      // last_evidence_at is sent as an ISO string, not a Date: drizzle turns off the
      // postgres.js date serializer, so a raw Date inside a hand-written sql template is
      // never converted and the query fails.
      const updated = await tx.execute<{ id: string }>(sql`
        UPDATE student_mastery_states SET
          alpha = ${next.alpha.toFixed(SCALE.priors)},
          beta = ${next.beta.toFixed(SCALE.priors)},
          mastery_score = ${next.masteryScore.toFixed(SCALE.scores)},
          confidence_score = ${next.confidenceScore.toFixed(SCALE.scores)},
          evidence_count = ${next.evidenceCount},
          distinct_question_count = ${next.distinctQuestionCount},
          coverage_score = ${next.coverageScore.toFixed(SCALE.scores)},
          state = ${next.state},
          algorithm_version = ${ALGORITHM_VERSION},
          config_version = ${this.config.configVersion},
          row_version = row_version + 1,
          last_evidence_at = ${input.attempt.answeredAt.toISOString()}
        WHERE id = ${row.id} AND row_version = ${row.row_version}
        RETURNING id`);
      if (updated.length !== 1) {
        throw new Error(`Mastery state ${row.id} changed while locked; aborting the attempt.`);
      }

      await tx.execute(sql`
        INSERT INTO mastery_events
          (student_id, attempt_id, skill_id, subskill_id, before_mastery, after_mastery,
           before_confidence, after_confidence, positive_evidence, negative_evidence,
           reason_code, difficulty, attribution_weight, algorithm_version, config_version)
        VALUES
          (${input.studentId}, ${event.attemptId}, ${target.skillId}, ${target.subskillId},
           ${event.beforeMastery.toFixed(SCALE.scores)}, ${event.afterMastery.toFixed(SCALE.scores)},
           ${event.beforeConfidence.toFixed(SCALE.scores)}, ${event.afterConfidence.toFixed(SCALE.scores)},
           ${event.positiveEvidence.toFixed(SCALE.evidence)}, ${event.negativeEvidence.toFixed(SCALE.evidence)},
           ${event.reasonCode}, ${event.difficulty.toFixed(SCALE.difficulty)},
           ${event.attributionWeight.toFixed(SCALE.weight)},
           ${event.algorithmVersion}, ${event.configVersion})`);

      applied.push({
        skillId: target.skillId,
        subskillId: target.subskillId,
        event,
        state: next.state,
      });
    }
    return applied;
  }

  /** Creates the node's state at the prior if absent, then locks it. */
  private async lockState(
    tx: DbTransaction,
    input: AttemptEvidenceInput,
    target: EvidenceTarget,
  ): Promise<StateRow> {
    const initial = initialNodeMastery(this.config);
    // The conflict target repeats the expressions of the unique index
    // student_mastery_states_student_node_unique exactly.
    await tx.execute(sql`
      INSERT INTO student_mastery_states
        (student_id, exam_id, skill_id, subskill_id, alpha, beta, mastery_score,
         confidence_score, coverage_score, state, algorithm_version, config_version)
      VALUES
        (${input.studentId}, ${input.examId}, ${target.skillId}, ${target.subskillId},
         ${initial.alpha.toFixed(SCALE.priors)}, ${initial.beta.toFixed(SCALE.priors)},
         ${initial.masteryScore.toFixed(SCALE.scores)}, ${initial.confidenceScore.toFixed(SCALE.scores)},
         ${initial.coverageScore.toFixed(SCALE.scores)}, ${initial.state},
         ${ALGORITHM_VERSION}, ${this.config.configVersion})
      ON CONFLICT (student_id,
                   (COALESCE(skill_id, ${NIL_UUID}::uuid)),
                   (COALESCE(subskill_id, ${NIL_UUID}::uuid)))
      DO NOTHING`);

    const rows = await tx.execute<StateRow>(sql`
      SELECT id, alpha, beta, mastery_score, confidence_score, evidence_count,
             distinct_question_count, coverage_score, state, row_version
      FROM student_mastery_states
      WHERE student_id = ${input.studentId}
        AND skill_id IS NOT DISTINCT FROM ${target.skillId}
        AND subskill_id IS NOT DISTINCT FROM ${target.subskillId}
      FOR UPDATE`);
    const row = rows[0];
    if (!row) throw new Error("Mastery state row missing after upsert.");
    return row;
  }
}

function nodeKey(target: EvidenceTarget): string {
  return target.skillId ? `skill:${target.skillId}` : `subskill:${target.subskillId}`;
}

function toNodeMastery(row: StateRow): NodeMastery {
  return {
    alpha: Number(row.alpha),
    beta: Number(row.beta),
    masteryScore: Number(row.mastery_score),
    confidenceScore: Number(row.confidence_score),
    evidenceCount: row.evidence_count,
    distinctQuestionCount: row.distinct_question_count,
    coverageScore: Number(row.coverage_score),
    state: row.state,
  };
}
