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

/** B5: UI_BRAND.md "Student Dashboard Principle" — where am I, strengths, gaps, what now. */

const COOKIE = "qup_session";
const PASSWORD = "dashboard passphrase";
const CORRECT = "B";

let app: NestFastifyApplication;

interface Student {
  token: string;
  id: string;
}

interface Card {
  exam: { id: string; nameAr: string };
  hasAccess: boolean;
  nextStep: { type: string; [key: string]: unknown };
  standing: {
    summary: Record<string, number>;
    strengths: { skillName: string; state: string; mastery: number }[];
    gaps: { skillName: string; severity: number }[];
    improvements: { nodeName: string; before: number; after: number }[];
  } | null;
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

async function cardFor(student: Student, examId: string): Promise<Card | undefined> {
  const response = await call(student.token, "GET", "/me/dashboard");
  return response.json<{ exams: Card[] }>().exams.find((card) => card.exam.id === examId);
}

async function grantAccess(student: Student, examId: string) {
  await e2eSql`
    INSERT INTO entitlements (student_id, exam_id, source, starts_at)
    VALUES (${student.id}, ${examId}, 'ADMIN', now() - interval '1 day')`;
}

async function state(
  student: Student,
  examId: string,
  skillId: string,
  values: { alpha: number; beta: number; state: string },
) {
  const mastery = values.alpha / (values.alpha + values.beta);
  const confidence = 1 - Math.exp(-(values.alpha + values.beta - 4) / 8);
  await e2eSql`
    INSERT INTO student_mastery_states (student_id, exam_id, skill_id, alpha, beta, mastery_score,
      confidence_score, coverage_score, evidence_count, distinct_question_count, state,
      algorithm_version, config_version)
    VALUES (${student.id}, ${examId}, ${skillId}, ${values.alpha}, ${values.beta},
      ${mastery.toFixed(5)}, ${confidence.toFixed(5)}, 1, 20, 3, ${values.state}::mastery_state,
      'mastery-v1.0', 'mastery-config-v1.0')`;
}

async function completedFullDiagnostic(student: Student, examId: string) {
  await e2eSql`
    INSERT INTO assessment_sessions (student_id, exam_id, type, status, completed_at, scoring_version)
    VALUES (${student.id}, ${examId}, 'FULL_DIAGNOSTIC', 'COMPLETED', now(), 'scoring-v1')`;
}

async function finishMini(student: Student, exam: LiveExam) {
  const id = (
    await call(student.token, "POST", `/exams/${exam.examId}/assessments/mini-diagnostic`)
  ).json<{ id: string }>().id;
  await call(student.token, "POST", `/assessments/${id}/start`);
  for (;;) {
    const current = await call(student.token, "GET", `/assessments/${id}/current-item`);
    const item = current.json<{ item: { id: string } | null }>().item;
    if (!item) return;
    await call(student.token, "POST", `/assessments/${id}/items/${item.id}/answer`, {
      answer: { optionKey: CORRECT },
    });
  }
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

describe("student dashboard", () => {
  it("needs a session and is empty before any activity", async () => {
    expect((await call(null, "GET", "/me/dashboard")).statusCode).toBe(401);
    const student = await register("dash-empty");
    const response = await call(student.token, "GET", "/me/dashboard");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ exams: [] });
  });

  it("asks an unpaid student to subscribe after the mini diagnostic, without the skill map", async () => {
    const exam = await liveExam(3);
    const student = await register("dash-unpaid");
    await finishMini(student, exam);
    expect(await cardFor(student, exam.examId)).toMatchObject({
      hasAccess: false,
      nextStep: { type: "SUBSCRIBE" },
      standing: null,
    });

    const other = await register("dash-other");
    expect(await cardFor(other, exam.examId)).toBeUndefined();
  });

  it("names strengths, gaps and the next step for a paid student", async () => {
    const exam = await liveExam(10);
    const [verbal = "", quant = ""] = exam.skillIds;
    const student = await register("dash-paid");
    await grantAccess(student, exam.examId);
    expect((await cardFor(student, exam.examId))?.nextStep).toEqual({
      type: "START_FULL_DIAGNOSTIC",
    });

    await completedFullDiagnostic(student, exam.examId);
    await state(student, exam.examId, verbal, {
      alpha: 36,
      beta: 4,
      state: "READY_FOR_REASSESSMENT",
    });
    await state(student, exam.examId, quant, { alpha: 6, beta: 14, state: "GAP" });
    const card = await cardFor(student, exam.examId);
    expect(card?.nextStep).toEqual({ type: "REASSESS", skillId: verbal, skillName: "VERBAL-S1" });
    expect(card?.standing?.summary).toEqual({
      skills: 2,
      assessed: 2,
      gaps: 1,
      readyForReassessment: 1,
      mastered: 0,
    });
    expect(card?.standing?.strengths.map((s) => s.skillName)).toEqual(["VERBAL-S1"]);
    expect(card?.standing?.gaps.map((g) => g.skillName)).toEqual(["QUANT-S1"]);
    expect(card?.standing?.improvements).toEqual([]);
  });

  it("resumes an open session first, and shows this week's improvement", async () => {
    const exam = await liveExam(10);
    const [, quant = ""] = exam.skillIds;
    const student = await register("dash-training");
    await grantAccess(student, exam.examId);
    await completedFullDiagnostic(student, exam.examId);
    await state(student, exam.examId, quant, { alpha: 6, beta: 14, state: "GAP" });

    const sessionId = (
      await call(student.token, "POST", `/exams/${exam.examId}/assessments/training`)
    ).json<{ id: string }>().id;
    await call(student.token, "POST", `/assessments/${sessionId}/start`);
    for (let n = 0; n < 2; n++) {
      const item = (
        await call(student.token, "GET", `/assessments/${sessionId}/current-item`)
      ).json<{ item: { id: string } }>().item;
      await call(student.token, "POST", `/assessments/${sessionId}/items/${item.id}/answer`, {
        answer: { optionKey: CORRECT },
      });
    }

    const card = await cardFor(student, exam.examId);
    expect(card?.nextStep).toEqual({
      type: "RESUME_SESSION",
      sessionId,
      sessionType: "ADAPTIVE_TRAINING",
    });
    const [improvement] = card?.standing?.improvements ?? [];
    expect(improvement?.nodeName).toBe("QUANT-S1");
    expect(improvement?.before).toBeCloseTo(0.3, 5);
    expect(improvement?.after).toBeGreaterThan(0.3);
  });
});
