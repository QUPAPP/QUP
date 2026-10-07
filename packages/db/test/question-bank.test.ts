import { afterAll, describe, expect, it } from "vitest";

import { expectRejected, firstRow, SqlState, testSql, withRollback } from "./support/db.js";
import { buildQuestionGraph, publish } from "./support/fixtures.js";

afterAll(() => testSql.end());

// ERD.md — "Exactly one learning target reference per mapping row."
describe("question skill mappings", () => {
  it("rejects a mapping that targets both a skill and a subskill", () =>
    withRollback(async (tx) => {
      const graph = await buildQuestionGraph(tx);

      await expectRejected(
        tx,
        SqlState.checkViolation,
        (sp) => sp`
          INSERT INTO question_skill_mappings
            (question_version_id, skill_id, subskill_id, role, attribution_weight)
          VALUES (${graph.questionVersionId}, ${graph.skillId}, ${graph.subskillId}, 'PRIMARY', 1)`,
      );
    }));

  it("rejects a mapping that targets no node at all", () =>
    withRollback(async (tx) => {
      const graph = await buildQuestionGraph(tx);

      await expectRejected(
        tx,
        SqlState.checkViolation,
        (sp) => sp`
          INSERT INTO question_skill_mappings (question_version_id, role, attribution_weight)
          VALUES (${graph.questionVersionId}, 'PRIMARY', 1)`,
      );
    }));
});

// ERD.md — skill_prerequisites: "No self/cycles." (cycles are checked in the application layer)
describe("skill prerequisites", () => {
  it("rejects a skill listed as its own prerequisite", () =>
    withRollback(async (tx) => {
      const graph = await buildQuestionGraph(tx);

      await expectRejected(
        tx,
        SqlState.checkViolation,
        (sp) => sp`
          INSERT INTO skill_prerequisites (skill_id, prerequisite_skill_id)
          VALUES (${graph.skillId}, ${graph.skillId})`,
      );
    }));
});

// DOMAIN_MODEL.md §3 — a published version is never edited in a way that erases history.
describe("published question content", () => {
  it("lets a draft version be edited freely", () =>
    withRollback(async (tx) => {
      const graph = await buildQuestionGraph(tx);

      await tx`
        UPDATE question_versions SET stem_content = '{"text":"revised"}'::jsonb
        WHERE id = ${graph.questionVersionId}`;
    }));

  it("freezes the stem once published", () =>
    withRollback(async (tx) => {
      const graph = await buildQuestionGraph(tx);
      await publish(tx, graph);

      await expectRejected(
        tx,
        SqlState.restrictViolation,
        (sp) => sp`
          UPDATE question_versions SET stem_content = '{"text":"rewritten"}'::jsonb
          WHERE id = ${graph.questionVersionId}`,
      );
    }));

  it("freezes the answer key once published", () =>
    withRollback(async (tx) => {
      const graph = await buildQuestionGraph(tx);
      await tx`
        INSERT INTO question_options (question_version_id, key, content, is_correct)
        VALUES (${graph.questionVersionId}, 'A', '{}'::jsonb, true)`;
      await publish(tx, graph);

      await expectRejected(
        tx,
        SqlState.restrictViolation,
        (sp) => sp`
          UPDATE question_options SET is_correct = false
          WHERE question_version_id = ${graph.questionVersionId}`,
      );
      await expectRejected(
        tx,
        SqlState.restrictViolation,
        (sp) => sp`
          INSERT INTO question_options (question_version_id, key, content, is_correct)
          VALUES (${graph.questionVersionId}, 'B', '{}'::jsonb, true)`,
      );
    }));

  it("freezes the skill mapping once published", () =>
    withRollback(async (tx) => {
      const graph = await buildQuestionGraph(tx);
      await publish(tx, graph);

      await expectRejected(
        tx,
        SqlState.restrictViolation,
        (sp) => sp`
          INSERT INTO question_skill_mappings
            (question_version_id, skill_id, role, attribution_weight)
          VALUES (${graph.questionVersionId}, ${graph.skillId}, 'PRIMARY', 1)`,
      );
    }));

  it("never moves a published version back to draft, and never deletes it", () =>
    withRollback(async (tx) => {
      const graph = await buildQuestionGraph(tx);
      await publish(tx, graph);

      await expectRejected(
        tx,
        SqlState.restrictViolation,
        (sp) => sp`
          UPDATE question_versions SET status = 'DRAFT' WHERE id = ${graph.questionVersionId}`,
      );
      await expectRejected(
        tx,
        SqlState.restrictViolation,
        (sp) => sp`DELETE FROM question_versions WHERE id = ${graph.questionVersionId}`,
      );
    }));

  it("still allows calibration and archiving of a published version", () =>
    withRollback(async (tx) => {
      const graph = await buildQuestionGraph(tx);
      await publish(tx, graph);

      await tx`
        UPDATE question_versions SET difficulty_measured_score = 0.62
        WHERE id = ${graph.questionVersionId}`;
      await tx`
        UPDATE question_versions SET status = 'ARCHIVED' WHERE id = ${graph.questionVersionId}`;

      const row = firstRow(
        await tx<{ status: string }[]>`
          SELECT status FROM question_versions WHERE id = ${graph.questionVersionId}`,
      );
      expect(row.status).toBe("ARCHIVED");
    }));
});
