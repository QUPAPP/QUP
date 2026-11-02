import { randomUUID } from "node:crypto";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  deleteE2eUsers,
  E2E_DATABASE_URL,
  e2eEmail,
  e2eSql,
  purgeE2eCatalog,
} from "../support/e2e-database.js";
import { type LiveExam, liveExam } from "../support/live-exam.js";
import { buildTestApp, testConfig } from "../support/test-app.js";

/** AI_INTEGRATION.md "Student Explanation": a student's own wrong training answer, explained. */

const COOKIE = "qup_session";
const PASSWORD = "tutor passphrase";
const CORRECT = "B";
const WRONG = "A";

interface Student {
  token: string;
  id: string;
}

let app: NestFastifyApplication;

const config = (overrides: Record<string, string> = {}) =>
  testConfig({
    DATABASE_URL: E2E_DATABASE_URL,
    AUTH_RATE_LIMIT_PER_MINUTE: "10000",
    AI_STUDENT_EXPLANATIONS: "true",
    ...overrides,
  });

async function register(target: NestFastifyApplication, label: string): Promise<Student> {
  const response = await target.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email: e2eEmail(label), password: PASSWORD },
  });
  return {
    token: response.cookies.find((c) => c.name === COOKIE)?.value ?? "",
    id: response.json<{ user: { id: string } }>().user.id,
  };
}

function call(
  target: NestFastifyApplication,
  token: string | null,
  method: "GET" | "POST",
  url: string,
  payload?: object,
) {
  return target.inject({
    method,
    url: `/api/v1${url}`,
    ...(token === null ? {} : { cookies: { [COOKIE]: token } }),
    headers: url.includes("/items/") ? { "idempotency-key": randomUUID() } : {},
    ...(payload ? { payload: payload as Record<string, unknown> } : {}),
  });
}

const errorCode = (r: { json: () => unknown }) =>
  (r.json() as { error: { code: string } }).error.code;

/** A student with access who answered one training question wrong and one right. */
async function studentWithMistake(exam: LiveExam, label: string) {
  const student = await register(app, label);
  await e2eSql`
    INSERT INTO entitlements (student_id, exam_id, source, starts_at)
    VALUES (${student.id}, ${exam.examId}, 'ADMIN', now() - interval '1 day')`;
  await e2eSql`
    INSERT INTO student_mastery_states (student_id, exam_id, skill_id, alpha, beta, mastery_score,
      confidence_score, coverage_score, evidence_count, distinct_question_count, state,
      algorithm_version, config_version)
    VALUES (${student.id}, ${exam.examId}, ${exam.skillIds[0] ?? ""}, 3, 7, 0.3, 0.8, 1, 13, 3,
      'GAP', 'mastery-v1.0', 'mastery-config-v1.0')`;
  const sessionId = (
    await call(app, student.token, "POST", `/exams/${exam.examId}/assessments/training`)
  ).json<{ id: string }>().id;
  await call(app, student.token, "POST", `/assessments/${sessionId}/start`);
  const answerNext = async (optionKey: string) => {
    const current = (
      await call(app, student.token, "GET", `/assessments/${sessionId}/current-item`)
    ).json<{ item: { id: string } }>();
    await call(
      app,
      student.token,
      "POST",
      `/assessments/${sessionId}/items/${current.item.id}/answer`,
      {
        answer: { optionKey },
      },
    );
    return current.item.id;
  };
  await answerNext(WRONG);
  const rightItem = await answerNext(CORRECT);
  const [wrong] = await e2eSql<{ question_version_id: string }[]>`
    SELECT i.question_version_id FROM assessment_items i
    WHERE i.session_id = ${sessionId} AND i.ordinal = 1`;
  const [right] = await e2eSql<{ question_version_id: string }[]>`
    SELECT question_version_id FROM assessment_items WHERE id = ${rightItem}`;
  return {
    student,
    wrongQuestion: wrong?.question_version_id ?? "",
    rightQuestion: right?.question_version_id ?? "",
  };
}

beforeAll(async () => {
  await purgeE2eCatalog();
  await deleteE2eUsers();
  ({ app } = await buildTestApp({ config: config() }));
});

afterAll(async () => {
  await app.close();
  await purgeE2eCatalog();
  await deleteE2eUsers();
  await e2eSql.end();
});

describe("personalised explanations of a student's mistakes", () => {
  let other: NestFastifyApplication | null = null;
  afterEach(async () => {
    await other?.close();
    other = null;
  });

  it("explains the student's own wrong answer once, then serves it again", async () => {
    const exam = await liveExam(10);
    const { student, wrongQuestion } = await studentWithMistake(exam, "tutor-own");
    const url = `/exams/${exam.examId}/mistakes/${wrongQuestion}/ai-explanation`;

    expect((await call(app, student.token, "GET", "/me/ai-features")).json()).toEqual({
      mistakeExplanations: true,
    });
    const first = await call(app, student.token, "POST", url);
    expect(first.statusCode, first.payload).toBe(200);
    expect(first.json()).toMatchObject({
      explanation: { errorType: "UNKNOWN", cached: false },
    });
    const again = await call(app, student.token, "POST", url);
    expect(again.json()).toMatchObject({ explanation: { cached: true } });

    const runs = await e2eSql<{ task: string; requested_by: string }[]>`
      SELECT task, requested_by FROM ai_runs
      WHERE subject_type = 'student_mistake' AND subject_id = ${wrongQuestion}`;
    expect(runs).toEqual([{ task: "explain_mistake", requested_by: student.id }]);
  });

  it("refuses questions the student did not get wrong, and other students", async () => {
    const exam = await liveExam(10);
    const { student, wrongQuestion, rightQuestion } = await studentWithMistake(exam, "tutor-guard");
    const outsider = await register(app, "tutor-outsider");

    const right = await call(
      app,
      student.token,
      "POST",
      `/exams/${exam.examId}/mistakes/${rightQuestion}/ai-explanation`,
    );
    expect(right.statusCode).toBe(404);
    expect(errorCode(right)).toBe("MISTAKE_NOT_FOUND");

    const url = `/exams/${exam.examId}/mistakes/${wrongQuestion}/ai-explanation`;
    const foreign = await call(app, outsider.token, "POST", url);
    expect(foreign.statusCode).toBe(403);
    expect(errorCode(foreign)).toBe("TRAINING_REQUIRES_ACCESS");
    expect((await call(app, null, "POST", url)).statusCode).toBe(401);
  });

  it("stays off until the product owner turns it on", async () => {
    ({ app: other } = await buildTestApp({ config: config({ AI_STUDENT_EXPLANATIONS: "false" }) }));
    const exam = await liveExam(3);
    const student = await register(other, "tutor-off");
    expect((await call(other, student.token, "GET", "/me/ai-features")).json()).toEqual({
      mistakeExplanations: false,
    });
    const refused = await call(
      other,
      student.token,
      "POST",
      `/exams/${exam.examId}/mistakes/${randomUUID()}/ai-explanation`,
    );
    expect(refused.statusCode).toBe(503);
    expect(errorCode(refused)).toBe("AI_STUDENT_EXPLANATIONS_OFF");
  });
});
