import { afterAll, describe, expect, it } from "vitest";

import { expectRejected, SqlState, testSql, withRollback } from "./support/db.js";
import { answerItem, buildQuestionGraph, insertMasteryEvent } from "./support/fixtures.js";

afterAll(() => testSql.end());

// ADAPTIVE_ENGINE.md §22 — "same attempt + learning node = one mastery event only".
describe("mastery evidence", () => {
  it("rejects duplicate evidence for the same attempt and skill (NULL subskill)", () =>
    withRollback(async (tx) => {
      // The NULL-subskill case is exactly where a plain UNIQUE constraint would
      // let the duplicate through, because NULL <> NULL in SQL.
      const graph = await buildQuestionGraph(tx);
      const attemptId = await answerItem(tx, graph, graph.itemId, "k");
      const skillOnly = { skillId: graph.skillId, subskillId: null };
      await insertMasteryEvent(tx, graph, attemptId, skillOnly);

      await expectRejected(tx, SqlState.uniqueViolation, (sp) =>
        insertMasteryEvent(sp, graph, attemptId, skillOnly),
      );
    }));

  it("allows one attempt to produce evidence for several distinct nodes", () =>
    withRollback(async (tx) => {
      const graph = await buildQuestionGraph(tx);
      const attemptId = await answerItem(tx, graph, graph.itemId, "k");

      await insertMasteryEvent(tx, graph, attemptId, { skillId: graph.skillId, subskillId: null });
      await insertMasteryEvent(tx, graph, attemptId, {
        skillId: null,
        subskillId: graph.subskillId,
      });

      const [row] = await tx<{ n: number }[]>`
        SELECT count(*)::int AS n FROM mastery_events WHERE attempt_id = ${attemptId}`;
      expect(row?.n).toBe(2);
    }));

  it("requires every event to target exactly one learning node", () =>
    withRollback(async (tx) => {
      const graph = await buildQuestionGraph(tx);
      const attemptId = await answerItem(tx, graph, graph.itemId, "k");

      await expectRejected(tx, SqlState.checkViolation, (sp) =>
        insertMasteryEvent(sp, graph, attemptId, {
          skillId: graph.skillId,
          subskillId: graph.subskillId,
        }),
      );
      await expectRejected(tx, SqlState.checkViolation, (sp) =>
        insertMasteryEvent(sp, graph, attemptId, { skillId: null, subskillId: null }),
      );
    }));

  // DOMAIN_MODEL.md §3 — "MasteryEvent immutable".
  it("treats mastery events as an append-only ledger", () =>
    withRollback(async (tx) => {
      const graph = await buildQuestionGraph(tx);
      const attemptId = await answerItem(tx, graph, graph.itemId, "k");
      await insertMasteryEvent(tx, graph, attemptId, { skillId: graph.skillId, subskillId: null });

      await expectRejected(
        tx,
        SqlState.restrictViolation,
        (sp) => sp`UPDATE mastery_events SET after_mastery = 0.99 WHERE attempt_id = ${attemptId}`,
      );
      await expectRejected(
        tx,
        SqlState.restrictViolation,
        (sp) => sp`DELETE FROM mastery_events WHERE attempt_id = ${attemptId}`,
      );
      await expectRejected(tx, SqlState.restrictViolation, (sp) => sp`TRUNCATE mastery_events`);
    }));

  it("keeps a single mastery state row per student and learning node", () =>
    withRollback(async (tx) => {
      const graph = await buildQuestionGraph(tx);
      const insertState = (db: typeof tx) => db`
        INSERT INTO student_mastery_states
          (student_id, exam_id, skill_id, algorithm_version, config_version)
        VALUES (${graph.studentId}, ${graph.examId}, ${graph.skillId}, 'mastery-v1.0', 'config-test')`;
      await insertState(tx);

      await expectRejected(tx, SqlState.uniqueViolation, (sp) => insertState(sp));
    }));
});
