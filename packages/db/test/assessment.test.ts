import { afterAll, describe, it } from "vitest";

import {
  expectRejected,
  firstRow,
  SqlState,
  type Tx,
  testSql,
  withRollback,
} from "./support/db.js";
import { addItem, answerItem, buildQuestionGraph } from "./support/fixtures.js";

afterAll(() => testSql.end());

// DOMAIN_MODEL.md §3 — Assessment invariants.
describe("assessment integrity", () => {
  it("rejects a second attempt on an already-answered item", () =>
    withRollback(async (tx) => {
      const graph = await buildQuestionGraph(tx);
      await answerItem(tx, graph, graph.itemId, "key-1");

      await expectRejected(tx, SqlState.uniqueViolation, (sp) =>
        answerItem(sp, graph, graph.itemId, "key-2"),
      );
    }));

  it("rejects a replayed submission that reuses an idempotency key", () =>
    withRollback(async (tx) => {
      const graph = await buildQuestionGraph(tx);
      const secondItem = await addItem(tx, graph, 2);
      await answerItem(tx, graph, graph.itemId, "same-key");

      await expectRejected(tx, SqlState.uniqueViolation, (sp) =>
        answerItem(sp, graph, secondItem, "same-key"),
      );
    }));

  it("requires an ANSWERED attempt to carry a grading result", () =>
    withRollback(async (tx) => {
      const graph = await buildQuestionGraph(tx);

      await expectRejected(
        tx,
        SqlState.checkViolation,
        (sp) => sp`
          INSERT INTO question_attempts (assessment_item_id, student_id, result_type, idempotency_key)
          VALUES (${graph.itemId}, ${graph.studentId}, 'ANSWERED', 'ungraded')`,
      );
    }));

  it("forbids grading a SKIPPED attempt (skip yields no evidence in V1)", () =>
    withRollback(async (tx) => {
      const graph = await buildQuestionGraph(tx);

      await expectRejected(
        tx,
        SqlState.checkViolation,
        (sp) => sp`
          INSERT INTO question_attempts
            (assessment_item_id, student_id, is_correct, result_type, idempotency_key)
          VALUES (${graph.itemId}, ${graph.studentId}, false, 'SKIPPED', 'graded-skip')`,
      );
    }));

  it("only links an item to an adaptive decision when it was selected adaptively", () =>
    withRollback(async (tx) => {
      const graph = await buildQuestionGraph(tx);
      // A real decision, so the only thing that can reject the link is the CHECK.
      const decision = firstRow(
        await tx<{ id: string }[]>`
          INSERT INTO adaptive_decisions (student_id, target_skill_id, engine_version, config_version)
          VALUES (${graph.studentId}, ${graph.skillId}, 'engine-test', 'config-test') RETURNING id`,
      );

      // The fixture item was selected FIXED, not ADAPTIVE.
      await expectRejected(
        tx,
        SqlState.checkViolation,
        (sp) => sp`
          UPDATE assessment_items SET adaptive_decision_id = ${decision.id}
          WHERE id = ${graph.itemId}`,
      );
    }));
});

describe("assessment sessions", () => {
  const openSession = (db: Tx, studentId: string, examId: string) =>
    db`
      INSERT INTO assessment_sessions (student_id, exam_id, type, scoring_version)
      VALUES (${studentId}, ${examId}, 'MINI_DIAGNOSTIC', 'scoring-test')`;

  it("allows one unfinished session per student, exam and type", () =>
    withRollback(async (tx) => {
      // The fixture already opened a MINI_DIAGNOSTIC session for this student and exam.
      const graph = await buildQuestionGraph(tx);

      await expectRejected(tx, SqlState.uniqueViolation, (sp) =>
        openSession(sp, graph.studentId, graph.examId),
      );
    }));

  it("allows a new session once the previous one is finished", () =>
    withRollback(async (tx) => {
      const graph = await buildQuestionGraph(tx);
      await tx`UPDATE assessment_sessions SET status = 'COMPLETED' WHERE id = ${graph.sessionId}`;

      await openSession(tx, graph.studentId, graph.examId);
    }));
});
