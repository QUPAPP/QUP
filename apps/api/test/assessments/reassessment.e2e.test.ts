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
 * B4: ADAPTIVE_ENGINE.md §12–§13, WORKFLOWS.md §5 — five questions, pass at
 * least 4/5 plus the final conditions; a failure holds the skill until five
 * new answers with evidence.
 */

const COOKIE = "qup_session";
const PASSWORD = "reassessment passphrase";
const CORRECT = "B";
const WRONG = "A";
const SIZE = 5;

let app: NestFastifyApplication;

interface Student {
  token: string;
  id: string;
}

interface Result {
  skill: { id: string; name: string };
  passed: boolean;
  correct: number;
  total: number;
  requiredCorrect: number;
  remainingAttempts: number | null;
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

const errorOf = (r: { json: () => unknown }) =>
  (r.json() as { error: { code: string; details?: unknown } }).error;

async function grantAccess(student: Student, examId: string) {
  await e2eSql`
    INSERT INTO entitlements (student_id, exam_id, source, starts_at)
    VALUES (${student.id}, ${examId}, 'ADMIN', now() - interval '1 day')`;
}

/** Ready for reassessment: mastery 0.9 from α 36 / β 4, confidence ≈ 0.99, coverage 1 (§12). */
async function readyOn(
  student: Student,
  examId: string,
  node: { skillId?: string; subskillId?: string },
  state = "READY_FOR_REASSESSMENT",
) {
  await e2eSql`
    INSERT INTO student_mastery_states (student_id, exam_id, skill_id, subskill_id, alpha, beta,
      mastery_score, confidence_score, coverage_score, evidence_count, distinct_question_count, state,
      algorithm_version, config_version)
    VALUES (${student.id}, ${examId}, ${node.skillId ?? null}, ${node.subskillId ?? null}, 36, 4,
      0.9, 0.98889, 1, 36, 3, ${state}::mastery_state, 'mastery-v1.0', 'mastery-config-v1.0')`;
}

const startReassessment = (student: Student, examId: string, skillId: string) =>
  call(student.token, "POST", `/exams/${examId}/skills/${skillId}/reassessment`);

/** Starts the session and answers every item; `wrong` of them with the wrong key. */
async function finish(student: Student, sessionId: string, wrong = 0) {
  await call(student.token, "POST", `/assessments/${sessionId}/start`);
  for (let n = 0; ; n++) {
    const current = await call(student.token, "GET", `/assessments/${sessionId}/current-item`);
    const item = current.json<{ item: { id: string } | null }>().item;
    if (!item) return;
    await call(student.token, "POST", `/assessments/${sessionId}/items/${item.id}/answer`, {
      answer: { optionKey: n < wrong ? WRONG : CORRECT },
    });
  }
}

const result = (student: Student, sessionId: string) =>
  call(student.token, "GET", `/assessments/${sessionId}/reassessment-result`);

async function profileSkill(student: Student, examId: string, skillId: string) {
  const profile = await call(student.token, "GET", `/exams/${examId}/skill-profile`);
  return profile
    .json<{
      domains: {
        skills: {
          id: string;
          state: string;
          reassessment: { remainingAttempts: number } | null;
        }[];
      }[];
    }>()
    .domains.flatMap((d) => d.skills)
    .find((s) => s.id === skillId);
}

async function train(student: Student, exam: LiveExam, answers: number) {
  const id = (
    await call(student.token, "POST", `/exams/${exam.examId}/assessments/training`)
  ).json<{ id: string }>().id;
  await call(student.token, "POST", `/assessments/${id}/start`);
  const targets: string[] = [];
  for (let n = 0; n < answers; n++) {
    const current = await call(student.token, "GET", `/assessments/${id}/current-item`);
    const item = current.json<{ item: { id: string; target: { skillName: string } } }>().item;
    targets.push(item.target.skillName);
    await call(student.token, "POST", `/assessments/${id}/items/${item.id}/answer`, {
      answer: { optionKey: CORRECT },
    });
  }
  return targets;
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

describe("skill reassessment", () => {
  it("is refused unless the skill is ready, paid for and has enough questions", async () => {
    const exam = await liveExam(10);
    const [verbal = "", quant = ""] = exam.skillIds;
    const student = await register("reassess-guards");
    expect(
      (await call(null, "POST", `/exams/${exam.examId}/skills/${verbal}/reassessment`)).statusCode,
    ).toBe(401);

    const unpaid = await startReassessment(student, exam.examId, verbal);
    expect(unpaid.statusCode).toBe(403);
    expect(errorOf(unpaid).code).toBe("REASSESSMENT_REQUIRES_ACCESS");

    await grantAccess(student, exam.examId);
    const missingExam = await startReassessment(student, randomUUID(), verbal);
    expect(missingExam.statusCode).toBe(404);
    expect(errorOf(missingExam).code).toBe("EXAM_NOT_AVAILABLE");
    const missingSkill = await startReassessment(student, exam.examId, randomUUID());
    expect(missingSkill.statusCode).toBe(404);
    expect(errorOf(missingSkill).code).toBe("SKILL_NOT_FOUND");

    const notReady = await startReassessment(student, exam.examId, quant);
    expect(notReady.statusCode).toBe(409);
    expect(errorOf(notReady)).toEqual(
      expect.objectContaining({
        code: "SKILL_NOT_READY_FOR_REASSESSMENT",
        details: { state: "UNASSESSED", remainingAttempts: null },
      }),
    );

    const small = await liveExam(3);
    await grantAccess(student, small.examId);
    await readyOn(student, small.examId, { skillId: small.skillIds[0] });
    const short = await startReassessment(student, small.examId, small.skillIds[0] ?? "");
    expect(short.statusCode).toBe(422);
    expect(errorOf(short).code).toBe("REASSESSMENT_NOT_ENOUGH_QUESTIONS");
  });

  it("passes with 5/5: MASTERED, recorded once, and training moves on", async () => {
    const exam = await liveExam(10);
    const [verbal = ""] = exam.skillIds;
    const student = await register("reassess-pass");
    await grantAccess(student, exam.examId);
    await readyOn(student, exam.examId, { skillId: verbal });

    const created = await startReassessment(student, exam.examId, verbal);
    expect(created.statusCode).toBe(201);
    const session = created.json<{ id: string; type: string }>();
    expect(session.type).toBe("SKILL_REASSESSMENT");
    expect((await startReassessment(student, exam.examId, verbal)).statusCode).toBe(200);

    const early = await result(student, session.id);
    expect(early.statusCode).toBe(422);
    expect(errorOf(early).code).toBe("ASSESSMENT_NOT_COMPLETED");

    const items = await e2eSql<{ skill_id: string | null }[]>`
      SELECT m.skill_id FROM assessment_items i
      JOIN question_skill_mappings m ON m.question_version_id = i.question_version_id AND m.role = 'PRIMARY'
      WHERE i.session_id = ${session.id}`;
    expect(items).toHaveLength(SIZE);
    expect(items.every((i) => i.skill_id === verbal)).toBe(true);

    await finish(student, session.id);
    const first = await result(student, session.id);
    expect(first.json<Result>()).toEqual({
      skill: { id: verbal, name: "VERBAL-S1" },
      passed: true,
      correct: 5,
      total: 5,
      requiredCorrect: 4,
      remainingAttempts: null,
    });
    await result(student, session.id);
    const [records] = await e2eSql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM skill_reassessments WHERE session_id = ${session.id}`;
    expect(records?.n).toBe(1);

    expect(await profileSkill(student, exam.examId, verbal)).toMatchObject({
      state: "MASTERED",
      reassessment: null,
    });
    expect(await train(student, exam, 1)).toEqual(["QUANT-S1"]);

    const other = await register("reassess-other");
    expect((await result(other, session.id)).statusCode).toBe(404);
  });

  it("fails with 3/5, holds the skill for five answers, then allows a retry", async () => {
    const exam = await liveExam(15);
    const [verbal = "", quant = ""] = exam.skillIds;
    const student = await register("reassess-fail");
    await grantAccess(student, exam.examId);
    await readyOn(student, exam.examId, { skillId: verbal });
    // Training must come back to the held skill, so nothing else is left to train.
    await readyOn(student, exam.examId, { skillId: quant }, "MASTERED");

    const session = (await startReassessment(student, exam.examId, verbal)).json<{ id: string }>();
    await finish(student, session.id, 2);
    expect((await result(student, session.id)).json<Result>()).toMatchObject({
      passed: false,
      correct: 3,
      requiredCorrect: 4,
      remainingAttempts: 5,
    });
    expect(await profileSkill(student, exam.examId, verbal)).toMatchObject({
      state: "DEVELOPING",
      reassessment: { remainingAttempts: 5 },
    });
    const held = await startReassessment(student, exam.examId, verbal);
    expect(held.statusCode).toBe(409);
    expect(errorOf(held).details).toEqual({ state: "DEVELOPING", remainingAttempts: 5 });

    expect(await train(student, exam, 5)).toEqual(Array(5).fill("VERBAL-S1"));
    expect(await profileSkill(student, exam.examId, verbal)).toMatchObject({
      state: "READY_FOR_REASSESSMENT",
      reassessment: null,
    });
  });

  it("masters every subskill of a skill measured through them", async () => {
    const exam = await liveExam(10, { viaSubskills: true });
    const [verbal = ""] = exam.skillIds;
    const [subskill] = await e2eSql<
      { id: string }[]
    >`SELECT id FROM subskills WHERE skill_id = ${verbal}`;
    const student = await register("reassess-subskills");
    await grantAccess(student, exam.examId);
    await readyOn(student, exam.examId, { subskillId: subskill?.id });

    const session = (await startReassessment(student, exam.examId, verbal)).json<{ id: string }>();
    await finish(student, session.id);
    expect((await result(student, session.id)).json<Result>().passed).toBe(true);
    const [row] = await e2eSql<{ state: string }[]>`
      SELECT state FROM student_mastery_states
      WHERE student_id = ${student.id} AND subskill_id = ${subskill?.id ?? ""}`;
    expect(row?.state).toBe("MASTERED");
    expect(await profileSkill(student, exam.examId, verbal)).toMatchObject({ state: "MASTERED" });
  });
});
