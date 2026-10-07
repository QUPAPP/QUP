import { afterAll, describe, it } from "vitest";

import {
  expectRejected,
  firstRow,
  SqlState,
  type Tx,
  testSql,
  withRollback,
} from "./support/db.js";
import { buildQuestionGraph, publish, type QuestionGraph } from "./support/fixtures.js";

afterAll(() => testSql.end());

const setStatus = (tx: Tx, graph: QuestionGraph, status: string) =>
  tx`UPDATE question_versions SET status = ${status}::question_version_status WHERE id = ${graph.questionVersionId}`;

async function addCorrectOptionAndMapping(tx: Tx, graph: QuestionGraph): Promise<void> {
  await tx`
    INSERT INTO question_options (question_version_id, key, content, is_correct)
    VALUES (${graph.questionVersionId}, 'A', '{}'::jsonb, true)`;
  await tx`
    INSERT INTO question_skill_mappings (question_version_id, skill_id, role, attribution_weight)
    VALUES (${graph.questionVersionId}, ${graph.skillId}, 'PRIMARY', 1)`;
}

// OPEN_QUESTIONS.md #16c: content changes only in DRAFT, so nothing unreviewed is published.
describe("reviewed content", () => {
  it("cannot be edited once approved — the gap that let unreviewed content ship", () =>
    withRollback(async (tx) => {
      const graph = await buildQuestionGraph(tx);
      await addCorrectOptionAndMapping(tx, graph);
      await setStatus(tx, graph, "UNDER_REVIEW");
      await setStatus(tx, graph, "APPROVED");

      await expectRejected(
        tx,
        SqlState.restrictViolation,
        (sp) => sp`
          UPDATE question_versions SET stem_content = '{"text":"changed after approval"}'::jsonb
          WHERE id = ${graph.questionVersionId}`,
      );
      await expectRejected(
        tx,
        SqlState.restrictViolation,
        (sp) => sp`
          UPDATE question_options SET is_correct = false
          WHERE question_version_id = ${graph.questionVersionId}`,
      );
    }));

  it("is frozen while under review too", () =>
    withRollback(async (tx) => {
      const graph = await buildQuestionGraph(tx);
      await setStatus(tx, graph, "UNDER_REVIEW");

      await expectRejected(
        tx,
        SqlState.restrictViolation,
        (sp) => sp`
          INSERT INTO question_options (question_version_id, key, content)
          VALUES (${graph.questionVersionId}, 'B', '{}'::jsonb)`,
      );
    }));

  it("becomes editable again only by sending the version back to DRAFT", () =>
    withRollback(async (tx) => {
      const graph = await buildQuestionGraph(tx);
      await setStatus(tx, graph, "UNDER_REVIEW");
      await setStatus(tx, graph, "DRAFT");

      await tx`
        UPDATE question_versions SET stem_content = '{"text":"revised"}'::jsonb
        WHERE id = ${graph.questionVersionId}`;
    }));
});

describe("question version lifecycle", () => {
  it("cannot skip review: DRAFT → PUBLISHED or DRAFT → APPROVED", () =>
    withRollback(async (tx) => {
      const graph = await buildQuestionGraph(tx);
      await addCorrectOptionAndMapping(tx, graph);

      for (const status of ["PUBLISHED", "APPROVED"]) {
        await expectRejected(tx, SqlState.restrictViolation, (sp) => setStatus(sp, graph, status));
      }
    }));

  it("only deletes drafts that never entered review", () =>
    withRollback(async (tx) => {
      const graph = await buildQuestionGraph(tx);
      await setStatus(tx, graph, "UNDER_REVIEW");

      await expectRejected(
        tx,
        SqlState.restrictViolation,
        (sp) => sp`DELETE FROM question_versions WHERE id = ${graph.questionVersionId}`,
      );
    }));

  it("sets published_at only when publishing", () =>
    withRollback(async (tx) => {
      const graph = await buildQuestionGraph(tx);

      await expectRejected(
        tx,
        SqlState.restrictViolation,
        (sp) => sp`
          UPDATE question_versions SET published_at = now() WHERE id = ${graph.questionVersionId}`,
      );
    }));
});

// DOMAIN_MODEL.md §3: a published question has a valid answer key and learning mapping.
describe("publishing invariants", () => {
  it("requires a correct option", () =>
    withRollback(async (tx) => {
      const graph = await buildQuestionGraph(tx);
      await tx`
        INSERT INTO question_options (question_version_id, key, content, is_correct)
        VALUES (${graph.questionVersionId}, 'A', '{}'::jsonb, false)`;
      await tx`
        INSERT INTO question_skill_mappings (question_version_id, skill_id, role, attribution_weight)
        VALUES (${graph.questionVersionId}, ${graph.skillId}, 'PRIMARY', 1)`;
      await setStatus(tx, graph, "UNDER_REVIEW");
      await setStatus(tx, graph, "APPROVED");

      await expectRejected(tx, SqlState.checkViolation, (sp) => setStatus(sp, graph, "PUBLISHED"));
    }));

  it("requires exactly one PRIMARY mapping", () =>
    withRollback(async (tx) => {
      const graph = await buildQuestionGraph(tx);
      await tx`
        INSERT INTO question_options (question_version_id, key, content, is_correct)
        VALUES (${graph.questionVersionId}, 'A', '{}'::jsonb, true)`;
      await tx`
        INSERT INTO question_skill_mappings (question_version_id, skill_id, role, attribution_weight)
        VALUES (${graph.questionVersionId}, ${graph.skillId}, 'SECONDARY', 0.35)`;
      await setStatus(tx, graph, "UNDER_REVIEW");
      await setStatus(tx, graph, "APPROVED");

      await expectRejected(tx, SqlState.checkViolation, (sp) => setStatus(sp, graph, "PUBLISHED"));
    }));

  it("keeps mappings inside the version's own taxonomy", () =>
    withRollback(async (tx) => {
      const graph = await buildQuestionGraph(tx);
      const otherVersion = firstRow(
        await tx<{ id: string }[]>`
          INSERT INTO taxonomy_versions (exam_id, version_code) VALUES (${graph.examId}, 'v2')
          RETURNING id`,
      );
      const domain = firstRow(
        await tx<{ id: string }[]>`
          INSERT INTO domains (taxonomy_version_id, code, name) VALUES (${otherVersion.id}, 'D', 'd')
          RETURNING id`,
      );
      const foreignSkill = firstRow(
        await tx<{ id: string }[]>`
          INSERT INTO skills (domain_id, code, name) VALUES (${domain.id}, 'S', 's') RETURNING id`,
      );

      await expectRejected(
        tx,
        SqlState.checkViolation,
        (sp) => sp`
          INSERT INTO question_skill_mappings (question_version_id, skill_id, role, attribution_weight)
          VALUES (${graph.questionVersionId}, ${foreignSkill.id}, 'PRIMARY', 1)`,
      );
    }));
});

// OPEN_QUESTIONS.md #16c: one version in progress, one live version per question.
describe("versions per question", () => {
  async function addVersion(tx: Tx, graph: QuestionGraph, versionNumber: number) {
    return tx`
      INSERT INTO question_versions
        (question_id, version_number, question_type, stem_content, difficulty_author_score, taxonomy_version_id)
      VALUES (${graph.questionId}, ${versionNumber}, 'SINGLE_CHOICE', '{}'::jsonb, 0.5, ${graph.taxonomyVersionId})`;
  }

  it("allows only one version in progress at a time", () =>
    withRollback(async (tx) => {
      const graph = await buildQuestionGraph(tx);
      await expectRejected(tx, SqlState.uniqueViolation, (sp) => addVersion(sp, graph, 2));
    }));

  it("allows a new draft once the previous version is published", () =>
    withRollback(async (tx) => {
      const graph = await buildQuestionGraph(tx);
      await publish(tx, graph);
      await addVersion(tx, graph, 2);
    }));
});
