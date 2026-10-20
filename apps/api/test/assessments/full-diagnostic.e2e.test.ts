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
 * PRD §3, §6, §7: after paying, the student continues to a full diagnostic
 * that completes what they already answered (OPEN_QUESTIONS.md #9a).
 */

const COOKIE = "qup_session";
const PASSWORD = "full diagnostic passphrase";
const CORRECT = "B";
const FULL_DEFAULT_SIZE = 40;

let app: NestFastifyApplication;

interface Student {
  token: string;
  id: string;
}

async function one<T>(rows: Promise<T[]>): Promise<T> {
  const [row] = await rows;
  if (!row) throw new Error("expected a row");
  return row;
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
    headers:
      method === "POST" && url.includes("/items/") ? { "idempotency-key": randomUUID() } : {},
    ...(payload ? { payload: payload as Record<string, unknown> } : {}),
  });
}

const errorOf = (r: { json: () => unknown }) =>
  (r.json() as { error: { code: string; details?: { sessionId?: string } } }).error;

const startFull = (student: Student, examId: string) =>
  call(student.token, "POST", `/exams/${examId}/assessments/full-diagnostic`);

async function grantAccess(student: Student, examId: string) {
  await e2eSql`
    INSERT INTO entitlements (student_id, exam_id, source, starts_at)
    VALUES (${student.id}, ${examId}, 'ADMIN', now() - interval '1 day')`;
}

/** Item question versions of a session, in order. */
async function itemsOf(sessionId: string) {
  return e2eSql<{ question_version_id: string; skill_id: string | null }[]>`
    SELECT i.question_version_id, m.skill_id
    FROM assessment_items i
    JOIN question_skill_mappings m
      ON m.question_version_id = i.question_version_id AND m.role = 'PRIMARY'
    WHERE i.session_id = ${sessionId}
    ORDER BY i.ordinal`;
}

/** Starts the session, then answers every item (skipping the first `skips`). */
async function finish(student: Student, sessionId: string, skips = 0) {
  await call(student.token, "POST", `/assessments/${sessionId}/start`);
  for (let n = 0; ; n++) {
    const current = await call(student.token, "GET", `/assessments/${sessionId}/current-item`);
    const item = current.json<{ item: { id: string } | null }>().item;
    if (!item) return;
    const path = `/assessments/${sessionId}/items/${item.id}`;
    if (n < skips) await call(student.token, "POST", `${path}/skip`, {});
    else await call(student.token, "POST", `${path}/answer`, { answer: { optionKey: CORRECT } });
  }
}

async function activeBlueprint(
  exam: LiveExam,
  input: { type: string; questionCount: number; versionId?: string; zeroDomain?: string },
) {
  const blueprint = await one(e2eSql<{ id: string }[]>`
    INSERT INTO assessment_blueprints
      (exam_id, taxonomy_version_id, code, type, name, min_questions, max_questions, status, config_version)
    VALUES (${exam.examId}, ${input.versionId ?? exam.versionId}, ${`BP-${randomUUID().slice(0, 8)}`},
            ${input.type}::blueprint_type, 'نموذج', 1, ${input.questionCount}, 'ACTIVE', 'blueprint-v1')
    RETURNING id`);
  if (input.zeroDomain) {
    await e2eSql`
      INSERT INTO blueprint_rules (blueprint_id, domain_id, target_weight)
      VALUES (${blueprint.id}, ${input.zeroDomain}, 0)`;
  }
  return blueprint.id;
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

describe("full diagnostic", () => {
  it("needs a session and paid access", async () => {
    const exam = await liveExam(3);
    const student = await register("full-unpaid");
    expect(
      (await call(null, "POST", `/exams/${exam.examId}/assessments/full-diagnostic`)).statusCode,
    ).toBe(401);
    const response = await startFull(student, exam.examId);
    expect(response.statusCode).toBe(403);
    expect(errorOf(response).code).toBe("FULL_DIAGNOSTIC_REQUIRES_ACCESS");
  });

  it("is unavailable for an exam that is not active", async () => {
    const student = await register("full-missing");
    const response = await startFull(student, randomUUID());
    expect(response.statusCode).toBe(404);
    expect(errorOf(response).code).toBe("EXAM_NOT_AVAILABLE");
  });

  it("asks the default 40 questions, and resumes the same session", async () => {
    const exam = await liveExam(30);
    const student = await register("full-fresh");
    await grantAccess(student, exam.examId);

    const created = await startFull(student, exam.examId);
    expect(created.statusCode).toBe(201);
    const session = created.json<{ id: string; type: string; status: string }>();
    expect(session).toMatchObject({ type: "FULL_DIAGNOSTIC", status: "CREATED" });
    expect(await itemsOf(session.id)).toHaveLength(FULL_DEFAULT_SIZE);

    const resumed = await startFull(student, exam.examId);
    expect(resumed.statusCode).toBe(200);
    expect(resumed.json<{ id: string }>().id).toBe(session.id);
  });

  it("continues from the mini diagnostic: answered questions count, skipped ones do not", async () => {
    const exam = await liveExam(30);
    const student = await register("full-continuing");
    const mini = await call(
      student.token,
      "POST",
      `/exams/${exam.examId}/assessments/mini-diagnostic`,
    );
    const miniId = mini.json<{ id: string }>().id;
    await finish(student, miniId, 1);
    await grantAccess(student, exam.examId);

    const full = (await startFull(student, exam.examId)).json<{ id: string }>();
    const fullItems = await itemsOf(full.id);
    // 12 asked, 11 answered: the diagnosis holds 40, so 29 are new.
    expect(fullItems).toHaveLength(FULL_DEFAULT_SIZE - 11);
    const miniQuestions = new Set((await itemsOf(miniId)).map((i) => i.question_version_id));
    expect(fullItems.some((i) => miniQuestions.has(i.question_version_id))).toBe(false);
  });

  it("follows the active blueprint's size and domain weights, then refuses a second run", async () => {
    const exam = await liveExam(10);
    const [verbal, quant] = exam.skillIds;
    const blueprintId = await activeBlueprint(exam, {
      type: "FULL_DIAGNOSTIC",
      questionCount: 6,
      zeroDomain: exam.domainIds[0],
    });
    const student = await register("full-blueprint");
    await grantAccess(student, exam.examId);

    const full = (await startFull(student, exam.examId)).json<{ id: string }>();
    const items = await itemsOf(full.id);
    expect(items).toHaveLength(6);
    expect(items.every((i) => i.skill_id === quant && i.skill_id !== verbal)).toBe(true);
    const [stored] = await e2eSql<{ blueprint_id: string | null }[]>`
      SELECT blueprint_id FROM assessment_sessions WHERE id = ${full.id}`;
    expect(stored?.blueprint_id).toBe(blueprintId);

    await finish(student, full.id);
    const again = await startFull(student, exam.examId);
    expect(again.statusCode).toBe(409);
    expect(errorOf(again)).toMatchObject({
      code: "FULL_DIAGNOSTIC_ALREADY_COMPLETED",
      details: { sessionId: full.id },
    });
  });

  it("ignores a blueprint pinned to a taxonomy version that is no longer published", async () => {
    const exam = await liveExam(25);
    const old = await one(e2eSql<{ id: string }[]>`
      INSERT INTO taxonomy_versions (exam_id, version_code, status)
      VALUES (${exam.examId}, 'v0', 'ARCHIVED') RETURNING id`);
    await activeBlueprint(exam, { type: "FULL_DIAGNOSTIC", questionCount: 4, versionId: old.id });
    const student = await register("full-stale");
    await grantAccess(student, exam.examId);

    const full = (await startFull(student, exam.examId)).json<{ id: string }>();
    expect(await itemsOf(full.id)).toHaveLength(FULL_DEFAULT_SIZE);
  });

  it("plans the mini diagnostic from its active blueprint too", async () => {
    const exam = await liveExam(10);
    const blueprintId = await activeBlueprint(exam, { type: "MINI_DIAGNOSTIC", questionCount: 4 });
    const student = await register("mini-blueprint");
    const mini = await call(
      student.token,
      "POST",
      `/exams/${exam.examId}/assessments/mini-diagnostic`,
    );
    const id = mini.json<{ id: string }>().id;
    expect(await itemsOf(id)).toHaveLength(4);
    const [stored] = await e2eSql<{ blueprint_id: string | null }[]>`
      SELECT blueprint_id FROM assessment_sessions WHERE id = ${id}`;
    expect(stored?.blueprint_id).toBe(blueprintId);
  });
});
