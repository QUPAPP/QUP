import { randomUUID } from "node:crypto";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AdminBootstrapService } from "../../src/modules/auth/application/admin-bootstrap.service.js";
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
 * PRD §6 "Full Re-Diagnostic when eligible", §8 and WORKFLOWS.md §6: a gate
 * of cooldown days and training answers, configurable; OPEN_QUESTIONS.md #12g.
 */

const COOKIE = "qup_session";
const PASSWORD = "re-diagnostic passphrase";
const GATE_KEY = "assessment.fullReassessment.gate";
const DAY_MS = 86_400_000;

let app: NestFastifyApplication;
let admin: string;
let student: { token: string; id: string };
let outsider: { token: string; id: string };
let exam: LiveExam;
let startVersion: number;
let fullDiagnosticId: string;
let reDiagnosticId: string;

function call(token: string | null, method: "GET" | "POST" | "PUT", url: string, payload?: object) {
  return app.inject({
    method,
    url: `/api/v1${url}`,
    ...(token === null ? {} : { cookies: { [COOKIE]: token } }),
    headers: url.includes("/items/") ? { "idempotency-key": randomUUID() } : {},
    ...(payload ? { payload: payload as Record<string, unknown> } : {}),
  });
}

const errorOf = (r: { json: () => unknown }) =>
  (
    r.json() as {
      error: {
        code: string;
        details?: { reason?: string; availableAt?: string; attemptsRemaining?: number };
      };
    }
  ).error;

async function register(label: string) {
  const email = e2eEmail(label);
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email, password: PASSWORD },
  });
  return {
    token: response.cookies.find((c) => c.name === COOKIE)?.value ?? "",
    id: response.json<{ user: { id: string } }>().user.id,
  };
}

interface Status {
  state: string;
  openSessionId: string | null;
  lastMeasuredAt: string | null;
  availableAt: string | null;
  trainingAttempts: { done: number; required: number };
  cooldownDays: number;
}

const statusOf = async (token: string) =>
  (await call(token, "GET", `/exams/${exam.examId}/full-reassessment`)).json<Status>();
const startReDiagnostic = (token: string) =>
  call(token, "POST", `/exams/${exam.examId}/assessments/full-reassessment`);

/** Answers every remaining item: correct ("B") when `correct(n)` says so, otherwise "A". */
async function finish(sessionId: string, correct: (n: number) => boolean) {
  await call(student.token, "POST", `/assessments/${sessionId}/start`);
  for (let n = 0; ; n++) {
    const item = (await call(student.token, "GET", `/assessments/${sessionId}/current-item`)).json<{
      item: { id: string } | null;
    }>().item;
    if (!item) return;
    await call(student.token, "POST", `/assessments/${sessionId}/items/${item.id}/answer`, {
      answer: { optionKey: correct(n) ? "B" : "A" },
    });
  }
}

const alternate = (n: number) => n % 2 === 0;

async function completedAt(sessionId: string): Promise<Date> {
  const [row] = await e2eSql<{ completed_at: Date }[]>`
    SELECT completed_at FROM assessment_sessions WHERE id = ${sessionId}`;
  if (!row) throw new Error("session missing");
  return row.completed_at;
}

/** Logical questions of the session's items, with each one's primary skill. */
async function questionsOf(sessionId: string) {
  return e2eSql<{ question_id: string; skill_id: string }[]>`
    SELECT v.question_id, m.skill_id
    FROM assessment_items i
    JOIN question_versions v ON v.id = i.question_version_id
    JOIN question_skill_mappings m ON m.question_version_id = v.id AND m.role = 'PRIMARY'
    WHERE i.session_id = ${sessionId}`;
}

async function gateVersion(): Promise<number> {
  const [row] = await e2eSql<{ version: number | null }[]>`
    SELECT max(version) AS version FROM system_settings WHERE key = ${GATE_KEY}`;
  return row?.version ?? 0;
}

beforeAll(async () => {
  await purgeE2eCatalog();
  await deleteE2eUsers();
  ({ app } = await buildTestApp({
    config: testConfig({ DATABASE_URL: E2E_DATABASE_URL, AUTH_RATE_LIMIT_PER_MINUTE: "10000" }),
  }));
  const adminEmail = e2eEmail("rediag-admin");
  await app.get(AdminBootstrapService).ensureAdmin({ email: adminEmail, password: PASSWORD });
  admin =
    (
      await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { identifier: adminEmail, password: PASSWORD },
      })
    ).cookies.find((c) => c.name === COOKIE)?.value ?? "";
  startVersion = await gateVersion();

  // 30 questions a skill: mini (12) and full (40 in all) leave unseen ones for training.
  exam = await liveExam(30);
  student = await register("rediag-student");
  outsider = await register("rediag-outsider");
  await e2eSql`
    INSERT INTO entitlements (student_id, exam_id, source, starts_at)
    VALUES (${student.id}, ${exam.examId}, 'ADMIN', now() - interval '1 day')`;
});

afterAll(async () => {
  await e2eSql`DELETE FROM system_settings WHERE key = ${GATE_KEY} AND version > ${startVersion}`;
  await app.close();
  await purgeE2eCatalog();
  await deleteE2eUsers();
  await e2eSql.end();
});

describe("full re-diagnostic", () => {
  it("needs paid access", async () => {
    expect((await statusOf(outsider.token)).state).toBe("REQUIRES_ACCESS");
    const response = await startReDiagnostic(outsider.token);
    expect(response.statusCode).toBe(403);
    expect(errorOf(response).code).toBe("FULL_REASSESSMENT_REQUIRES_ACCESS");
  });

  it("comes after the full diagnostic", async () => {
    expect(await statusOf(student.token)).toMatchObject({
      state: "FULL_DIAGNOSTIC_REQUIRED",
      lastMeasuredAt: null,
      availableAt: null,
      trainingAttempts: { done: 0, required: 30 },
      cooldownDays: 7,
    });
    const response = await startReDiagnostic(student.token);
    expect(response.statusCode).toBe(409);
    expect(errorOf(response)).toMatchObject({
      code: "FULL_REASSESSMENT_NOT_ELIGIBLE",
      details: { reason: "FULL_DIAGNOSTIC_REQUIRED" },
    });
  });

  it("waits a cooldown and training answers after the full diagnostic", async () => {
    const mini = (
      await call(student.token, "POST", `/exams/${exam.examId}/assessments/mini-diagnostic`)
    ).json<{ id: string }>().id;
    await finish(mini, alternate);
    fullDiagnosticId = (
      await call(student.token, "POST", `/exams/${exam.examId}/assessments/full-diagnostic`)
    ).json<{ id: string }>().id;
    await finish(fullDiagnosticId, alternate);

    const measured = await completedAt(fullDiagnosticId);
    const availableAt = new Date(measured.getTime() + 7 * DAY_MS).toISOString();
    expect(await statusOf(student.token)).toMatchObject({
      state: "WAITING",
      lastMeasuredAt: measured.toISOString(),
      availableAt,
      trainingAttempts: { done: 0, required: 30 },
    });
    const response = await startReDiagnostic(student.token);
    expect(response.statusCode).toBe(409);
    expect(errorOf(response).details).toEqual({
      reason: "WAITING",
      availableAt,
      attemptsRemaining: 30,
    });
  });

  it("opens once the admin's gate is met, and the dashboard offers it", async () => {
    const saved = await call(admin, "PUT", `/admin/settings/${GATE_KEY}`, {
      expectedVersion: startVersion,
      value: { cooldownDays: 1, minTrainingAttempts: 2 },
    });
    expect(saved.statusCode).toBe(200);

    const training = (
      await call(student.token, "POST", `/exams/${exam.examId}/assessments/training`)
    ).json<{ id: string }>().id;
    await call(student.token, "POST", `/assessments/${training}/start`);
    for (let n = 0; n < 2; n++) {
      const item = (
        await call(student.token, "GET", `/assessments/${training}/current-item`)
      ).json<{
        item: { id: string };
      }>().item;
      await call(student.token, "POST", `/assessments/${training}/items/${item.id}/answer`, {
        answer: { optionKey: "B" },
      });
    }
    await call(student.token, "POST", `/assessments/${training}/complete`);

    // The answers count, but a day has not passed since the full diagnostic.
    expect(await statusOf(student.token)).toMatchObject({
      state: "WAITING",
      trainingAttempts: { done: 2, required: 2 },
      cooldownDays: 1,
    });
    await e2eSql`
      UPDATE assessment_sessions SET completed_at = completed_at - interval '2 days'
      WHERE id = ${fullDiagnosticId}`;
    expect((await statusOf(student.token)).state).toBe("ELIGIBLE");

    const dashboard = (await call(student.token, "GET", "/me/dashboard")).json<{
      exams: { exam: { id: string }; nextStep: { type: string } }[];
    }>();
    const entry = dashboard.exams.find((e) => e.exam.id === exam.examId);
    expect(entry?.nextStep).toEqual({ type: "START_FULL_REASSESSMENT" });
  });

  it("starts once, resumes, and asks unseen questions before seen ones", async () => {
    const asked = new Set(
      (
        await e2eSql<{ question_id: string }[]>`
          SELECT DISTINCT v.question_id
          FROM assessment_items i
          JOIN assessment_sessions s ON s.id = i.session_id
          JOIN question_versions v ON v.id = i.question_version_id
          WHERE s.student_id = ${student.id} AND s.exam_id = ${exam.examId}`
      ).map((r) => r.question_id),
    );

    const created = await startReDiagnostic(student.token);
    expect(created.statusCode).toBe(201);
    const session = created.json<{ id: string; type: string }>();
    expect(session.type).toBe("FULL_REASSESSMENT");
    reDiagnosticId = session.id;
    const resumed = await startReDiagnostic(student.token);
    expect(resumed.statusCode).toBe(200);
    expect(resumed.json<{ id: string }>().id).toBe(reDiagnosticId);
    expect(await statusOf(student.token)).toMatchObject({
      state: "OPEN",
      openSessionId: reDiagnosticId,
    });

    const items = await questionsOf(reDiagnosticId);
    expect(items).toHaveLength(40);
    expect(new Set(items.map((i) => i.question_id)).size).toBe(40);
    // A seen question is used for a skill only once its unseen ones are all in.
    const bank = await e2eSql<{ question_id: string; skill_id: string }[]>`
      SELECT v.question_id, m.skill_id
      FROM question_versions v
      JOIN question_skill_mappings m ON m.question_version_id = v.id AND m.role = 'PRIMARY'
      WHERE m.skill_id IN ${e2eSql(exam.skillIds)} AND v.status = 'PUBLISHED'`;
    const inSession = new Set(items.map((i) => i.question_id));
    for (const skillId of exam.skillIds) {
      const reusesSeen = items.some((i) => i.skill_id === skillId && asked.has(i.question_id));
      const unseen = bank.filter((q) => q.skill_id === skillId && !asked.has(q.question_id));
      if (reusesSeen) expect(unseen.every((q) => inSession.has(q.question_id))).toBe(true);
    }

    const early = await call(
      student.token,
      "GET",
      `/assessments/${reDiagnosticId}/full-reassessment-result`,
    );
    expect(early.statusCode).toBe(422);
    expect(errorOf(early).code).toBe("ASSESSMENT_NOT_COMPLETED");
  });

  it("compares the new measurement with the first diagnosis, mini included", async () => {
    await finish(reDiagnosticId, (n) => n > 0);
    const response = await call(
      student.token,
      "GET",
      `/assessments/${reDiagnosticId}/full-reassessment-result`,
    );
    expect(response.statusCode).toBe(200);
    const result = response.json<{
      score: { correct: number; total: number };
      previous: { type: string; completedAt: string; correct: number; total: number };
      skills: {
        name: string;
        correct: number;
        total: number;
        previousCorrect: number;
        previousTotal: number;
      }[];
    }>();
    expect(result.score).toEqual({ correct: 39, total: 40 });
    // Mini (6 of 12) and full (14 of 28), answered alternately right and wrong.
    expect(result.previous).toMatchObject({ type: "FULL_DIAGNOSTIC", correct: 20, total: 40 });
    // The taxonomy's order: display order, then code (both domains share display order 0).
    expect(result.skills.map((s) => s.name)).toEqual(["QUANT-S1", "VERBAL-S1"]);
    const sum = (pick: (s: (typeof result.skills)[number]) => number) =>
      result.skills.reduce((total, s) => total + pick(s), 0);
    expect([sum((s) => s.correct), sum((s) => s.total)]).toEqual([39, 40]);
    expect([sum((s) => s.previousCorrect), sum((s) => s.previousTotal)]).toEqual([20, 40]);
    expect(response.payload).not.toContain("isCorrect");

    const [evidence] = await e2eSql<{ events: number }[]>`
      SELECT count(*)::int AS events
      FROM mastery_events e
      JOIN question_attempts a ON a.id = e.attempt_id
      JOIN assessment_items i ON i.id = a.assessment_item_id
      WHERE i.session_id = ${reDiagnosticId}`;
    expect(evidence?.events).toBeGreaterThan(0);
  });

  it("waits again after the re-diagnostic: earlier training no longer counts", async () => {
    const measured = await completedAt(reDiagnosticId);
    expect(await statusOf(student.token)).toMatchObject({
      state: "WAITING",
      lastMeasuredAt: measured.toISOString(),
      availableAt: new Date(measured.getTime() + DAY_MS).toISOString(),
      trainingAttempts: { done: 0, required: 2 },
    });
  });

  it("shows a result only for the student's own re-diagnostic", async () => {
    const theirs = await call(
      outsider.token,
      "GET",
      `/assessments/${reDiagnosticId}/full-reassessment-result`,
    );
    expect(theirs.statusCode).toBe(404);
    const otherType = await call(
      student.token,
      "GET",
      `/assessments/${fullDiagnosticId}/full-reassessment-result`,
    );
    expect(otherType.statusCode).toBe(404);
  });
});
