import { randomUUID } from "node:crypto";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  deleteE2eUsers,
  E2E_DATABASE_URL,
  e2eEmail,
  e2eSql,
  purgeE2eCatalog,
} from "../support/e2e-database.js";
import { type LiveExam, liveExam } from "../support/live-exam.js";
import { buildTestApp, testConfig } from "../support/test-app.js";

/**
 * B3: adaptive training (ADAPTIVE_ENGINE.md §15–§20, WORKFLOWS.md §4). Each
 * question is chosen when needed and recorded as an auditable decision.
 */

const COOKIE = "qup_session";
const PASSWORD = "training passphrase";
const CORRECT = "B";
const WRONG = "A";
const TRAINING_SIZE = 10;

let app: NestFastifyApplication;

interface Student {
  token: string;
  id: string;
}

interface CurrentItem {
  item: { id: string; target: { skillName: string } } | null;
  progress: { answered: number; total: number };
}

async function register(label: string): Promise<Student> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email: e2eEmail(label), password: PASSWORD },
  });
  return {
    token: response.cookies.find((c) => c.name === COOKIE)?.value ?? "",
    id: response.json<{ user: { id: string } }>().user.id,
  };
}

function call(token: string | null, method: "GET" | "POST", url: string, payload?: object) {
  return app.inject({
    method,
    url: `/api/v1${url}`,
    ...(token === null ? {} : { cookies: { [COOKIE]: token } }),
    headers: url.includes("/items/") ? { "idempotency-key": randomUUID() } : {},
    ...(payload ? { payload: payload as Record<string, unknown> } : {}),
  });
}

const errorCode = (r: { json: () => unknown }) =>
  (r.json() as { error: { code: string } }).error.code;

const startTraining = (student: Student, examId: string) =>
  call(student.token, "POST", `/exams/${examId}/assessments/training`);

async function grantAccess(student: Student, examId: string) {
  await e2eSql`
    INSERT INTO entitlements (student_id, exam_id, source, starts_at)
    VALUES (${student.id}, ${examId}, 'ADMIN', now() - interval '1 day')`;
}

/** A measured gap on the skill: mastery 0.3 with confidence 0.8 (ADAPTIVE_ENGINE.md §15). */
async function gapOn(student: Student, examId: string, skillId: string) {
  await e2eSql`
    INSERT INTO student_mastery_states (student_id, exam_id, skill_id, alpha, beta, mastery_score,
      confidence_score, coverage_score, evidence_count, distinct_question_count, state,
      algorithm_version, config_version)
    VALUES (${student.id}, ${examId}, ${skillId}, 3, 7, 0.3, 0.8, 1, 13, 3, 'GAP',
      'mastery-v1.0', 'mastery-config-v1.0')`;
}

async function started(student: Student, exam: LiveExam): Promise<string> {
  const id = (await startTraining(student, exam.examId)).json<{ id: string }>().id;
  await call(student.token, "POST", `/assessments/${id}/start`);
  return id;
}

const current = async (student: Student, sessionId: string) =>
  (await call(student.token, "GET", `/assessments/${sessionId}/current-item`)).json<CurrentItem>();

function answer(student: Student, sessionId: string, itemId: string, optionKey: string) {
  return call(student.token, "POST", `/assessments/${sessionId}/items/${itemId}/answer`, {
    answer: { optionKey },
  });
}

/** Items with their decisions, in order. */
async function decisionsOf(sessionId: string) {
  return e2eSql<
    {
      question_version_id: string;
      selected_by: string;
      selected_question_version_id: string | null;
      target_skill_id: string | null;
      reason_codes: string[] | null;
      engine_version: string | null;
      config_version: string | null;
    }[]
  >`
    SELECT i.question_version_id, i.selected_by, d.selected_question_version_id, d.target_skill_id,
           d.reason_codes, d.engine_version, d.config_version
    FROM assessment_items i
    LEFT JOIN adaptive_decisions d ON d.id = i.adaptive_decision_id
    WHERE i.session_id = ${sessionId}
    ORDER BY i.ordinal`;
}

beforeAll(async () => {
  await purgeE2eCatalog();
  await deleteE2eUsers();
  ({ app } = await buildTestApp({
    config: testConfig({ DATABASE_URL: E2E_DATABASE_URL, AUTH_RATE_LIMIT_PER_MINUTE: "10000" }),
  }));
});

afterAll(async () => {
  await app.close();
  await purgeE2eCatalog();
  await deleteE2eUsers();
  await e2eSql.end();
});

describe("adaptive training", () => {
  it("needs a session, paid access, an available exam and something to train", async () => {
    const exam = await liveExam(3);
    const student = await register("train-guards");
    expect(
      (await call(null, "POST", `/exams/${exam.examId}/assessments/training`)).statusCode,
    ).toBe(401);

    const unpaid = await startTraining(student, exam.examId);
    expect(unpaid.statusCode).toBe(403);
    expect(errorCode(unpaid)).toBe("TRAINING_REQUIRES_ACCESS");

    const missing = await startTraining(student, randomUUID());
    expect(missing.statusCode).toBe(404);
    expect(errorCode(missing)).toBe("EXAM_NOT_AVAILABLE");

    const empty = await liveExam(0);
    await grantAccess(student, empty.examId);
    const nothing = await startTraining(student, empty.examId);
    expect(nothing.statusCode).toBe(422);
    expect(errorCode(nothing)).toBe("NOTHING_TO_TRAIN");
  });

  it("starts once and resumes the open session", async () => {
    const exam = await liveExam(3);
    const student = await register("train-resume");
    await grantAccess(student, exam.examId);
    const created = await startTraining(student, exam.examId);
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ type: "ADAPTIVE_TRAINING", status: "CREATED" });
    const resumed = await startTraining(student, exam.examId);
    expect(resumed.statusCode).toBe(200);
    expect(resumed.json<{ id: string }>().id).toBe(created.json<{ id: string }>().id);

    const other = await register("train-other");
    const peek = await call(
      other.token,
      "GET",
      `/assessments/${created.json<{ id: string }>().id}`,
    );
    expect(peek.statusCode).toBe(404);
  });

  it("trains the gap, records an auditable decision with each question, and reviews answers", async () => {
    const exam = await liveExam(10);
    const [verbal] = exam.skillIds;
    const student = await register("train-gap");
    await grantAccess(student, exam.examId);
    await gapOn(student, exam.examId, verbal ?? "");
    const sessionId = await started(student, exam);

    const first = await current(student, sessionId);
    expect(first.item?.target.skillName).toBe("VERBAL-S1");
    expect(first.progress).toEqual({ answered: 0, total: TRAINING_SIZE });

    const [decision] = await decisionsOf(sessionId);
    expect(decision).toMatchObject({
      selected_by: "ADAPTIVE",
      target_skill_id: verbal,
      engine_version: "adaptive-v1.0",
      config_version: "selection-config-v1.0",
    });
    expect(decision?.selected_question_version_id).toBe(decision?.question_version_id);
    // Mastery 0.3 → target 0.3; every seeded question is 0.5, outside the ±0.15 band.
    expect(decision?.reason_codes).toEqual(["TOP_GAP", "DIFFICULTY_BAND_WIDENED"]);

    const answered = await answer(student, sessionId, first.item?.id ?? "", CORRECT);
    expect(answered.statusCode).toBe(200);
    expect(answered.json()).toMatchObject({
      result: { isCorrect: true },
      progress: { answered: 1, total: TRAINING_SIZE },
      next: { type: "QUESTION" },
      review: { correctOptionKeys: [CORRECT], explanation: null },
    });

    const second = await current(student, sessionId);
    expect(second.item?.id).not.toBe(first.item?.id);
    expect((await decisionsOf(sessionId))[1]?.reason_codes?.[0]).toBe("CONTINUE_TARGET");
  });

  it("creates one item when the next question is asked for twice at once", async () => {
    const exam = await liveExam(5);
    const student = await register("train-race");
    await grantAccess(student, exam.examId);
    const sessionId = await started(student, exam);
    const [a, b] = await Promise.all([current(student, sessionId), current(student, sessionId)]);
    expect(a.item?.id).toBe(b.item?.id);
    expect(await decisionsOf(sessionId)).toHaveLength(1);
  });

  it("checks a prerequisite after three wrong answers in a row", async () => {
    const exam = await liveExam(10, {
      beforePublish: async ({ skillIds: [verbal, quant] }) => {
        await e2eSql`
          INSERT INTO skill_prerequisites (skill_id, prerequisite_skill_id)
          VALUES (${verbal ?? ""}, ${quant ?? ""})`;
      },
    });
    const [verbal, quant] = exam.skillIds;
    const student = await register("train-prerequisite");
    await grantAccess(student, exam.examId);
    await gapOn(student, exam.examId, verbal ?? "");
    const sessionId = await started(student, exam);

    for (let n = 0; n < 3; n++) {
      const item = await current(student, sessionId);
      expect(item.item?.target.skillName).toBe("VERBAL-S1");
      await answer(student, sessionId, item.item?.id ?? "", WRONG);
    }
    const fourth = await current(student, sessionId);
    expect(fourth.item?.target.skillName).toBe("QUANT-S1");
    const decisions = await decisionsOf(sessionId);
    expect(decisions[3]).toMatchObject({ target_skill_id: quant });
    expect(decisions[3]?.reason_codes?.[0]).toBe("PREREQUISITE_CHECK");
  });

  it("completes after ten questions, never repeats one, and can end early", async () => {
    const exam = await liveExam(10);
    const student = await register("train-complete");
    await grantAccess(student, exam.examId);
    const sessionId = await started(student, exam);
    for (let n = 0; n < TRAINING_SIZE; n++) {
      const item = await current(student, sessionId);
      const response = await answer(student, sessionId, item.item?.id ?? "", CORRECT);
      expect(response.json<{ next: { type: string } }>().next.type).toBe(
        n === TRAINING_SIZE - 1 ? "COMPLETED" : "QUESTION",
      );
    }
    const done = await call(student.token, "GET", `/assessments/${sessionId}`);
    expect(done.json()).toMatchObject({
      status: "COMPLETED",
      progress: { answered: 10, total: 10 },
    });

    const next = await started(student, exam);
    expect(next).not.toBe(sessionId);
    const pending = await current(student, next);
    const ended = await call(student.token, "POST", `/assessments/${next}/complete`);
    expect(ended.json()).toMatchObject({ status: "COMPLETED" });
    const [attempts] = await e2eSql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM question_attempts WHERE assessment_item_id = ${pending.item?.id ?? ""}`;
    expect(attempts?.n).toBe(0);

    const given = [...(await decisionsOf(sessionId)), ...(await decisionsOf(next))].map(
      (d) => d.question_version_id,
    );
    expect(new Set(given).size).toBe(given.length);
  });

  it("ends the session, rather than failing, when no question is left to ask", async () => {
    const exam = await liveExam(1);
    const student = await register("train-exhausted");
    await grantAccess(student, exam.examId);
    const sessionId = await started(student, exam);
    for (let n = 0; n < exam.skillIds.length; n++) {
      const item = await current(student, sessionId);
      await answer(student, sessionId, item.item?.id ?? "", CORRECT);
    }
    const after = await call(student.token, "GET", `/assessments/${sessionId}/current-item`);
    expect(after.statusCode).toBe(200);
    expect(after.json<CurrentItem>().item).toBeNull();
    const session = await call(student.token, "GET", `/assessments/${sessionId}`);
    expect(session.json()).toMatchObject({ status: "COMPLETED", progress: { answered: 2 } });
  });

  it("keeps diagnostics free of the answer review", async () => {
    const exam = await liveExam(2);
    const student = await register("train-diagnostic");
    const mini = await call(
      student.token,
      "POST",
      `/exams/${exam.examId}/assessments/mini-diagnostic`,
    );
    const sessionId = mini.json<{ id: string }>().id;
    await call(student.token, "POST", `/assessments/${sessionId}/start`);
    const item = await current(student, sessionId);
    const response = await answer(student, sessionId, item.item?.id ?? "", CORRECT);
    expect(response.json()).not.toHaveProperty("review");
  });
  it("lists wrong training answers with their review, and only for the student with access", async () => {
    const exam = await liveExam(10);
    const [verbal] = exam.skillIds;
    const student = await register("train-mistakes");
    const outsider = await register("train-mistakes-outsider");
    await grantAccess(student, exam.examId);
    await gapOn(student, exam.examId, verbal ?? "");
    const sessionId = await started(student, exam);

    const empty = await call(student.token, "GET", `/exams/${exam.examId}/mistakes`);
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toEqual({ items: [] });

    const first = await current(student, sessionId);
    await answer(student, sessionId, first.item?.id ?? "", WRONG);
    const second = await current(student, sessionId);
    await answer(student, sessionId, second.item?.id ?? "", CORRECT);

    const listed = await call(student.token, "GET", `/exams/${exam.examId}/mistakes`);
    expect(listed.statusCode).toBe(200);
    const { items } = listed.json<{
      items: {
        skillName: string | null;
        chosenKeys: string[];
        correctOptionKeys: string[];
        correctedLater: boolean;
        question: { options: { key: string; isCorrect?: boolean }[] };
      }[];
    }>();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      skillName: "VERBAL-S1",
      chosenKeys: [WRONG],
      correctOptionKeys: [CORRECT],
      correctedLater: false,
    });
    expect(items[0]?.question.options.every((o) => !("isCorrect" in o))).toBe(true);

    const denied = await call(outsider.token, "GET", `/exams/${exam.examId}/mistakes`);
    expect(denied.statusCode).toBe(403);
    expect(errorCode(denied)).toBe("TRAINING_REQUIRES_ACCESS");
    expect((await call(null, "GET", `/exams/${exam.examId}/mistakes`)).statusCode).toBe(401);
  });

  it("never lists wrong answers given in a diagnostic", async () => {
    const exam = await liveExam(3);
    const student = await register("train-mistakes-diag");
    await grantAccess(student, exam.examId);
    const session = await call(
      student.token,
      "POST",
      `/exams/${exam.examId}/assessments/mini-diagnostic`,
    );
    const sessionId = session.json<{ id: string }>().id;
    await call(student.token, "POST", `/assessments/${sessionId}/start`);
    const item = await current(student, sessionId);
    await answer(student, sessionId, item.item?.id ?? "", WRONG);

    const listed = await call(student.token, "GET", `/exams/${exam.examId}/mistakes`);
    expect(listed.json()).toEqual({ items: [] });
  });
});
