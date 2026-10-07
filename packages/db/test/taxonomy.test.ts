import { afterAll, describe, it } from "vitest";

import {
  expectRejected,
  firstRow,
  SqlState,
  type Tx,
  testSql,
  withRollback,
} from "./support/db.js";
import { buildQuestionGraph } from "./support/fixtures.js";

afterAll(() => testSql.end());

type IdRow = { id: string };

const publishVersion = (tx: Tx, versionId: string) =>
  tx`UPDATE taxonomy_versions SET status = 'PUBLISHED' WHERE id = ${versionId}`;

async function addVersion(tx: Tx, examId: string, code: string): Promise<string> {
  return firstRow(
    await tx<IdRow[]>`
      INSERT INTO taxonomy_versions (exam_id, version_code) VALUES (${examId}, ${code}) RETURNING id`,
  ).id;
}

async function addDomainWithSkill(tx: Tx, versionId: string, code: string): Promise<string> {
  const domain = firstRow(
    await tx<IdRow[]>`
      INSERT INTO domains (taxonomy_version_id, code, name) VALUES (${versionId}, ${code}, 'd')
      RETURNING id`,
  );
  return firstRow(
    await tx<IdRow[]>`
      INSERT INTO skills (domain_id, code, name) VALUES (${domain.id}, ${`${code}-S`}, 's') RETURNING id`,
  ).id;
}

// WORKFLOWS.md §9 + OPEN_QUESTIONS.md #16b: a published taxonomy is read-only.
describe("draft taxonomy", () => {
  it("can be edited freely", () =>
    withRollback(async (tx) => {
      const graph = await buildQuestionGraph(tx);

      await tx`UPDATE skills SET weight = 2.5, name = 'renamed' WHERE id = ${graph.skillId}`;
      await tx`INSERT INTO subskills (skill_id, code, name) VALUES (${graph.skillId}, 'SS2', 'x')`;
      await tx`DELETE FROM subskills WHERE id = ${graph.subskillId}`;
    }));
});

describe("published taxonomy", () => {
  it("rejects new, edited or deleted nodes at every level", () =>
    withRollback(async (tx) => {
      const graph = await buildQuestionGraph(tx);
      const otherSkill = await addDomainWithSkill(tx, graph.taxonomyVersionId, "D2");
      await publishVersion(tx, graph.taxonomyVersionId);

      const reject = (statement: (sp: Tx) => Promise<unknown>) =>
        expectRejected(tx, SqlState.restrictViolation, statement);

      await reject(
        (sp) => sp`
          INSERT INTO domains (taxonomy_version_id, code, name)
          VALUES (${graph.taxonomyVersionId}, 'NEW', 'n')`,
      );
      await reject((sp) => sp`UPDATE skills SET weight = 9 WHERE id = ${graph.skillId}`);
      await reject(
        (sp) => sp`UPDATE subskills SET status = 'ARCHIVED' WHERE id = ${graph.subskillId}`,
      );
      await reject(
        (sp) =>
          sp`INSERT INTO subskills (skill_id, code, name) VALUES (${graph.skillId}, 'X', 'x')`,
      );
      await reject(
        (sp) => sp`
          INSERT INTO skill_prerequisites (skill_id, prerequisite_skill_id)
          VALUES (${graph.skillId}, ${otherSkill})`,
      );
    }));

  it("cannot receive a node moved in from a draft version", () =>
    withRollback(async (tx) => {
      const graph = await buildQuestionGraph(tx);
      const draft = await addVersion(tx, graph.examId, "v2");
      const draftSkill = await addDomainWithSkill(tx, draft, "D9");
      await publishVersion(tx, graph.taxonomyVersionId);

      const publishedDomain = firstRow(
        await tx<{ domain_id: string }[]>`SELECT domain_id FROM skills WHERE id = ${graph.skillId}`,
      ).domain_id;

      await expectRejected(
        tx,
        SqlState.restrictViolation,
        (sp) => sp`UPDATE skills SET domain_id = ${publishedDomain} WHERE id = ${draftSkill}`,
      );
    }));
});

describe("taxonomy version lifecycle", () => {
  it("only moves forward: DRAFT → PUBLISHED → ARCHIVED", () =>
    withRollback(async (tx) => {
      const graph = await buildQuestionGraph(tx);
      await publishVersion(tx, graph.taxonomyVersionId);

      await expectRejected(
        tx,
        SqlState.restrictViolation,
        (sp) => sp`
          UPDATE taxonomy_versions SET status = 'DRAFT' WHERE id = ${graph.taxonomyVersionId}`,
      );
      await expectRejected(
        tx,
        SqlState.restrictViolation,
        (sp) => sp`
          UPDATE taxonomy_versions SET version_code = 'renamed'
          WHERE id = ${graph.taxonomyVersionId}`,
      );
      await expectRejected(
        tx,
        SqlState.restrictViolation,
        (sp) => sp`DELETE FROM taxonomy_versions WHERE id = ${graph.taxonomyVersionId}`,
      );

      await tx`UPDATE taxonomy_versions SET status = 'ARCHIVED' WHERE id = ${graph.taxonomyVersionId}`;
    }));

  it("allows only one published version per exam at a time", () =>
    withRollback(async (tx) => {
      const graph = await buildQuestionGraph(tx);
      const next = await addVersion(tx, graph.examId, "v2");
      await publishVersion(tx, graph.taxonomyVersionId);

      await expectRejected(tx, SqlState.uniqueViolation, (sp) => publishVersion(sp, next));

      // The supported sequence: archive the current one, then publish the next.
      await tx`UPDATE taxonomy_versions SET status = 'ARCHIVED' WHERE id = ${graph.taxonomyVersionId}`;
      await publishVersion(tx, next);
    }));
});

describe("skill prerequisites", () => {
  it("must stay within one taxonomy version", () =>
    withRollback(async (tx) => {
      const graph = await buildQuestionGraph(tx);
      const otherVersion = await addVersion(tx, graph.examId, "v2");
      const foreignSkill = await addDomainWithSkill(tx, otherVersion, "D7");

      await expectRejected(
        tx,
        SqlState.checkViolation,
        (sp) => sp`
          INSERT INTO skill_prerequisites (skill_id, prerequisite_skill_id)
          VALUES (${graph.skillId}, ${foreignSkill})`,
      );
    }));
});
