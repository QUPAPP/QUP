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

/** The timed mock exam: planned up front, one clock, nothing revealed until it ends. */

const COOKIE = "qup_session";
const PASSWORD = "mock exam passphrase";
const CORRECT = "B";
const WRONG = "A";
const SECONDS_PER_QUESTION = 62.5;

interface Student {
  token: string;
  id: string;
}

let app: NestFastifyApplication;

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

async function withAccess(label: string, exam: LiveExam) {
  const student = await register(label);
  await e2eSql`
    INSERT INTO entitlements (student_id, exam_id, source, starts_at)
    VALUES (${student.id}, ${exam.examId}, 'ADMIN', now() - interval '1 day')`;
  return student;
}

async function startedMock(student: Student, exam: LiveExam) {
  const created = await call(student.token, "POST", `/exams/${exam.examId}/assessments/mock-exam`);
  expect(created.statusCode, created.payload).toBe(201);
  const id = created.json<{ id: string }>().id;
  await call(student.token, "POST", `/assessments/${id}/start`);
  return id;
}

async function answerCurrent(student: Student, sessionId: string, optionKey: string) {
  const current = (
    await call(student.token, "GET", `/assessments/${sessionId}/current-item`)
  ).json<{
    item: { id: string } | null;
  }>();
  if (!current.item) return null;
  return call(student.token, "POST", `/assessments/${sessionId}/items/${current.item.id}/answer`, {
    answer: { optionKey },
  });
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

describe("timed mock exam", () => {
  it("is paid, and needs an available exam", async () => {
    const exam = await liveExam(3);
    const student = await register("mock-guard");
    const refused = await call(
      student.token,
      "POST",
      `/exams/${exam.examId}/assessments/mock-exam`,
    );
    expect(refused.statusCode).toBe(403);
    expect(errorCode(refused)).toBe("MOCK_EXAM_REQUIRES_ACCESS");
    expect(
      (await call(null, "POST", `/exams/${exam.examId}/assessments/mock-exam`)).statusCode,
    ).toBe(401);
  });

  it("keeps answers hidden, then scores and reviews every question", async () => {
    const exam = await liveExam(4);
    const student = await withAccess("mock-flow", exam);
    const sessionId = await startedMock(student, exam);

    const session = (await call(student.token, "GET", `/assessments/${sessionId}`)).json<{
      type: string;
      startedAt: string;
      deadline: string;
      progress: { total: number };
    }>();
    expect(session.type).toBe("MOCK_EXAM");
    expect(session.progress.total).toBe(8);
    expect(new Date(session.deadline).getTime() - new Date(session.startedAt).getTime()).toBe(
      8 * SECONDS_PER_QUESTION * 1000,
    );

    const first = await answerCurrent(student, sessionId, CORRECT);
    expect(first?.json()).toMatchObject({ result: { isCorrect: null } });
    expect(first?.json()).not.toHaveProperty("review");
    await answerCurrent(student, sessionId, WRONG);

    const early = await call(student.token, "GET", `/assessments/${sessionId}/mock-result`);
    expect(errorCode(early)).toBe("ASSESSMENT_NOT_COMPLETED");
    // The student may hand in before answering everything.
    expect(
      (await call(student.token, "POST", `/assessments/${sessionId}/complete`)).statusCode,
    ).toBe(200);

    const result = await call(student.token, "GET", `/assessments/${sessionId}/mock-result`);
    expect(result.statusCode, result.payload).toBe(200);
    const body = result.json<{
      correct: number;
      answered: number;
      total: number;
      skills: { correct: number; total: number }[];
      review: { outcome: string; chosenKeys: string[]; correctOptionKeys: string[] }[];
    }>();
    expect(body).toMatchObject({ correct: 1, answered: 2, total: 8 });
    expect(body.skills.reduce((sum, skill) => sum + skill.total, 0)).toBe(8);
    expect(body.review).toHaveLength(8);
    expect(body.review[0]).toMatchObject({ outcome: "CORRECT", chosenKeys: [CORRECT] });
    expect(body.review[1]).toMatchObject({ outcome: "INCORRECT", correctOptionKeys: [CORRECT] });
    expect(body.review[2]).toMatchObject({ outcome: "NOT_ANSWERED", chosenKeys: [] });

    // Another mock exam may follow.
    const again = await call(student.token, "POST", `/exams/${exam.examId}/assessments/mock-exam`);
    expect(again.statusCode).toBe(201);
  });

  it("ends when the clock runs out, keeping the answers given in time", async () => {
    const exam = await liveExam(2);
    const student = await withAccess("mock-clock", exam);
    const sessionId = await startedMock(student, exam);
    await answerCurrent(student, sessionId, CORRECT);
    await e2eSql`
      UPDATE assessment_sessions SET started_at = now() - interval '2 hours' WHERE id = ${sessionId}`;

    const current = (await call(student.token, "GET", `/assessments/${sessionId}`)).json<{
      deadline: string;
    }>();
    expect(new Date(current.deadline).getTime()).toBeLessThan(Date.now());
    const late = await call(
      student.token,
      "POST",
      `/assessments/${sessionId}/items/${randomUUID()}/answer`,
      { answer: { optionKey: CORRECT } },
    );
    expect(late.statusCode).toBe(404);

    const item = await e2eSql<{ id: string }[]>`
      SELECT id FROM assessment_items WHERE session_id = ${sessionId} ORDER BY ordinal OFFSET 1 LIMIT 1`;
    const timedOut = await call(
      student.token,
      "POST",
      `/assessments/${sessionId}/items/${item[0]?.id ?? ""}/answer`,
      { answer: { optionKey: CORRECT } },
    );
    expect(timedOut.statusCode).toBe(409);
    expect(errorCode(timedOut)).toBe("MOCK_EXAM_TIME_UP");

    const result = await call(student.token, "GET", `/assessments/${sessionId}/mock-result`);
    expect(result.json()).toMatchObject({ correct: 1, answered: 1 });
  });
});
