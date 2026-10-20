import { randomUUID } from "node:crypto";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  deleteE2eUsers,
  E2E_DATABASE_URL,
  e2eEmail,
  e2eExamCode,
  e2eSql,
  purgeE2eCatalog,
} from "../support/e2e-database.js";
import { buildTestApp, testConfig } from "../support/test-app.js";

/**
 * The first vertical slice (IMPLEMENTATION_PLAN.md):
 *   Student: account → mini diagnostic → answers
 *   System:  attempt → mastery event → updated mastery state
 */

const COOKIE = "qup_session";
const PASSWORD = "assessment test passphrase";
const CORRECT = "B";
const WRONG = "A";

let app: NestFastifyApplication;
let studentA: string;
let studentAId: string;
let studentB: string;

interface LiveExam {
  examId: string;
  skillIds: string[];
}

interface LiveExamOptions {
  skillsPerDomain?: number;
  /** Map each question to a subskill of its skill instead of the skill itself. */
  viaSubskills?: boolean;
}

async function one<T>(rows: Promise<T[]>): Promise<T> {
  const [row] = await rows;
  if (!row) throw new Error("expected a row");
  return row;
}

/**
 * An ACTIVE exam with a published taxonomy — two domains weighted 1 and 2,
 * one skill each unless told otherwise — and published single-choice
 * questions whose answer is "B". Skills are named after their code.
 * Written directly: the catalog and question-bank APIs have their own tests.
 */
async function liveExam(
  questionsPerSkill: number,
  { skillsPerDomain = 1, viaSubskills = false }: LiveExamOptions = {},
): Promise<LiveExam> {
  const exam = await one(e2eSql<{ id: string }[]>`
    INSERT INTO exams (code, slug, name_ar, status)
    VALUES (${e2eExamCode()}, ${`e2e-a-${randomUUID().slice(0, 8)}`}, 'تشخيص', 'ACTIVE')
    RETURNING id`);
  const version = await one(e2eSql<{ id: string }[]>`
    INSERT INTO taxonomy_versions (exam_id, version_code) VALUES (${exam.id}, 'v1') RETURNING id`);

  const skillIds: string[] = [];
  const subskillOf = new Map<string, string>();
  for (const [code, weight] of [
    ["VERBAL", 1],
    ["QUANT", 2],
  ] as const) {
    const domain = await one(e2eSql<{ id: string }[]>`
      INSERT INTO domains (taxonomy_version_id, code, name, weight)
      VALUES (${version.id}, ${code}, ${code}, ${weight}) RETURNING id`);
    for (let n = 1; n <= skillsPerDomain; n++) {
      const skillCode = `${code}-S${n}`;
      const skill = await one(e2eSql<{ id: string }[]>`
        INSERT INTO skills (domain_id, code, name, min_coverage, display_order)
        VALUES (${domain.id}, ${skillCode}, ${skillCode}, 3, ${n}) RETURNING id`);
      skillIds.push(skill.id);
      if (viaSubskills) {
        const subskill = await one(e2eSql<{ id: string }[]>`
          INSERT INTO subskills (skill_id, code, name)
          VALUES (${skill.id}, ${`${skillCode}-SUB`}, ${`${skillCode}-SUB`}) RETURNING id`);
        subskillOf.set(skill.id, subskill.id);
      }
    }
  }
  await e2eSql`UPDATE taxonomy_versions SET status = 'PUBLISHED' WHERE id = ${version.id}`;

  for (const skillId of skillIds) {
    for (let i = 0; i < questionsPerSkill; i++) {
      const question = await one(e2eSql<{ id: string }[]>`
        INSERT INTO questions (stable_code) VALUES (${`E2E-${randomUUID()}`}) RETURNING id`);
      const qv = await one(e2eSql<{ id: string }[]>`
        INSERT INTO question_versions
          (question_id, version_number, question_type, stem_content, difficulty_author_score, taxonomy_version_id)
        VALUES (${question.id}, 1, 'SINGLE_CHOICE',
                ${e2eSql.json({ blocks: [{ type: "text", text: `سؤال ${i}` }] })}, 0.5, ${version.id})
        RETURNING id`);
      await e2eSql`
        INSERT INTO question_options (question_version_id, key, content, is_correct, display_order) VALUES
          (${qv.id}, 'A', ${e2eSql.json({ blocks: [{ type: "text", text: "3" }] })}, false, 0),
          (${qv.id}, 'B', ${e2eSql.json({ blocks: [{ type: "text", text: "4" }] })}, true, 1)`;
      const subskillId = subskillOf.get(skillId) ?? null;
      await e2eSql`
        INSERT INTO question_skill_mappings
          (question_version_id, skill_id, subskill_id, role, attribution_weight)
        VALUES (${qv.id}, ${subskillId ? null : skillId}, ${subskillId}, 'PRIMARY', 1)`;
      for (const status of ["UNDER_REVIEW", "APPROVED"]) {
        await e2eSql`UPDATE question_versions SET status = ${status}::question_version_status WHERE id = ${qv.id}`;
      }
      await e2eSql`UPDATE question_versions SET status = 'PUBLISHED', published_at = now() WHERE id = ${qv.id}`;
    }
  }
  return { examId: exam.id, skillIds };
}

async function register(label: string): Promise<{ token: string; id: string }> {
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

function call(
  token: string,
  method: "GET" | "POST",
  url: string,
  options: { payload?: object; key?: string } = {},
) {
  return app.inject({
    method,
    url: `/api/v1${url}`,
    cookies: { [COOKIE]: token },
    headers: options.key ? { "idempotency-key": options.key } : {},
    ...(options.payload ? { payload: options.payload as Record<string, unknown> } : {}),
  });
}

const errorCode = (r: { json: () => unknown }) =>
  (r.json() as { error: { code: string } }).error.code;

async function startedSession(token: string, examId: string): Promise<string> {
  const created = await call(token, "POST", `/exams/${examId}/assessments/mini-diagnostic`);
  const sessionId = created.json<{ id: string }>().id;
  await call(token, "POST", `/assessments/${sessionId}/start`);
  return sessionId;
}

async function currentItemId(token: string, sessionId: string): Promise<string> {
  const response = await call(token, "GET", `/assessments/${sessionId}/current-item`);
  return response.json<{ item: { id: string } }>().item.id;
}

function answer(
  token: string,
  sessionId: string,
  itemId: string,
  optionKey: string,
  key = randomUUID(),
) {
  return call(token, "POST", `/assessments/${sessionId}/items/${itemId}/answer`, {
    key,
    payload: { answer: { optionKey } },
  });
}

beforeAll(async () => {
  await purgeE2eCatalog();
  await deleteE2eUsers();
  ({ app } = await buildTestApp({
    config: testConfig({ DATABASE_URL: E2E_DATABASE_URL, AUTH_RATE_LIMIT_PER_MINUTE: "10000" }),
  }));
  const a = await register("student-a");
  studentA = a.token;
  studentAId = a.id;
  studentB = (await register("student-b")).token;
});

afterAll(async () => {
  await app.close();
  await purgeE2eCatalog();
  await deleteE2eUsers();
  await e2eSql.end();
});

describe("starting a mini diagnostic", () => {
  it("creates 12 items spread across domains by weight, and resumes instead of duplicating", async () => {
    const exam = await liveExam(10);
    const first = await call(studentA, "POST", `/exams/${exam.examId}/assessments/mini-diagnostic`);
    expect(first.statusCode).toBe(201);
    const session = first.json<{ id: string; status: string; resumed: boolean }>();
    expect(session).toMatchObject({ status: "CREATED", resumed: false });

    const perSkill = await e2eSql<{ skill_id: string; n: number }[]>`
      SELECT m.skill_id, count(1)::int AS n
      FROM assessment_items ai
      JOIN question_skill_mappings m ON m.question_version_id = ai.question_version_id AND m.role = 'PRIMARY'
      WHERE ai.session_id = ${session.id} GROUP BY m.skill_id`;
    const counts = Object.fromEntries(perSkill.map((r) => [r.skill_id, r.n]));
    // Domain weights 1 : 2 → 4 : 8 of 12.
    expect(counts).toEqual({ [exam.skillIds[0] as string]: 4, [exam.skillIds[1] as string]: 8 });

    const again = await call(studentA, "POST", `/exams/${exam.examId}/assessments/mini-diagnostic`);
    expect(again.statusCode).toBe(200);
    expect(again.json()).toMatchObject({ id: session.id, resumed: true });
  });

  it("is unavailable for an exam that is not active", async () => {
    const exam = await liveExam(1);
    await e2eSql`UPDATE exams SET status = 'ARCHIVED' WHERE id = ${exam.examId}`;
    const response = await call(
      studentA,
      "POST",
      `/exams/${exam.examId}/assessments/mini-diagnostic`,
    );
    expect(response.statusCode).toBe(404);
    expect(errorCode(response)).toBe("EXAM_NOT_AVAILABLE");
  });
});

describe("ownership", () => {
  it("hides one student's session from another (no IDOR)", async () => {
    const exam = await liveExam(3);
    const sessionId = await startedSession(studentA, exam.examId);

    for (const url of [`/assessments/${sessionId}`, `/assessments/${sessionId}/current-item`]) {
      const response = await call(studentB, "GET", url);
      expect(response.statusCode).toBe(404);
      expect(errorCode(response)).toBe("ASSESSMENT_NOT_FOUND");
    }
  });
});

describe("student session history", () => {
  it("requires a session and rejects forged ownership, invalid filters and unbounded pages", async () => {
    const unauthenticated = await app.inject({ method: "GET", url: "/api/v1/assessments" });
    expect(unauthenticated.statusCode).toBe(401);
    for (const query of [
      `studentId=${studentAId}`,
      "examId=invalid",
      "status=UNKNOWN",
      "limit=0",
      "limit=101",
      "limit=1.5",
      "offset=-1",
      "offset=1000001",
      "offset=NaN",
    ]) {
      const response = await call(studentA, "GET", `/assessments?${query}`);
      expect(response.statusCode, query).toBe(400);
      expect(errorCode(response)).toBe("VALIDATION_FAILED");
    }
  });

  it("returns only the caller's sessions, counts skips and reveals no answer or mastery data", async () => {
    const exam = await liveExam(2);
    const sessionId = await startedSession(studentA, exam.examId);
    const otherSession = await startedSession(studentB, exam.examId);
    await answer(studentA, sessionId, await currentItemId(studentA, sessionId), CORRECT);
    await call(
      studentA,
      "POST",
      `/assessments/${sessionId}/items/${await currentItemId(studentA, sessionId)}/skip`,
      {
        key: randomUUID(),
      },
    );

    const response = await call(studentA, "GET", `/assessments?examId=${exam.examId}`);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      items: [
        {
          id: sessionId,
          examId: exam.examId,
          type: "MINI_DIAGNOSTIC",
          status: "IN_PROGRESS",
          exam: { id: exam.examId, nameAr: expect.any(String) },
          startedAt: expect.any(String),
          completedAt: null,
          createdAt: expect.any(String),
          progress: { answered: 2, total: 4 },
        },
      ],
      page: { limit: 20, offset: 0, hasMore: false },
    });
    for (const hidden of [
      otherSession,
      studentAId,
      "questionVersionId",
      "submittedAnswer",
      "isCorrect",
      "mastery",
      "correctAnswer",
    ]) {
      expect(response.payload).not.toContain(hidden);
    }
    // An exam filter never grants visibility into the other student's sessions.
    expect(
      (await call(studentB, "GET", `/assessments?examId=${exam.examId}`)).json(),
    ).toMatchObject({
      items: [{ id: otherSession, progress: { answered: 0, total: 4 } }],
    });
  });

  it("keeps history readable after an exam is archived", async () => {
    const exam = await liveExam(1);
    const sessionId = await startedSession(studentA, exam.examId);
    await finish(studentA, sessionId, () => "CORRECT");
    await e2eSql`UPDATE exams SET status = 'ARCHIVED' WHERE id = ${exam.examId}`;
    const response = await call(
      studentA,
      "GET",
      `/assessments?examId=${exam.examId}&status=COMPLETED`,
    );
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      items: [
        {
          id: sessionId,
          exam: { id: exam.examId, nameAr: expect.any(String) },
          progress: { answered: 2, total: 2 },
        },
      ],
    });
    const empty = await call(studentA, "GET", `/assessments?examId=${exam.examId}&status=CREATED`);
    expect(empty.json()).toEqual({ items: [], page: { limit: 20, offset: 0, hasMore: false } });
  });

  it("paginates deterministically when sessions share a timestamp and filters before pagination", async () => {
    const exam = await liveExam(1);
    const [olderId, newestId] = [randomUUID(), randomUUID()].sort() as [string, string];
    for (const id of [olderId, newestId]) {
      await e2eSql`
        INSERT INTO assessment_sessions (id, student_id, exam_id, type, status, scoring_version, created_at)
        VALUES (${id}, ${studentAId}, ${exam.examId}, 'MINI_DIAGNOSTIC', 'ABANDONED', 'scoring-v1', '2026-01-01T00:00:00Z')`;
    }
    const path = `/assessments?examId=${exam.examId}&status=ABANDONED&limit=1`;
    const first = await call(studentA, "GET", path);
    expect(first.json()).toMatchObject({
      items: [{ id: newestId, progress: { answered: 0, total: 0 } }],
      page: { limit: 1, offset: 0, hasMore: true },
    });
    const second = await call(studentA, "GET", `${path}&offset=1`);
    expect(second.json()).toMatchObject({
      items: [{ id: olderId }],
      page: { limit: 1, offset: 1, hasMore: false },
    });
    const beyond = await call(studentA, "GET", `${path}&offset=2`);
    expect(beyond.json()).toEqual({ items: [], page: { limit: 1, offset: 2, hasMore: false } });
  });
});

describe("the answer path", () => {
  it("never sends the answer key with a question", async () => {
    const exam = await liveExam(3);
    const sessionId = await startedSession(studentA, exam.examId);
    const response = await call(studentA, "GET", `/assessments/${sessionId}/current-item`);

    expect(response.statusCode).toBe(200);
    expect(response.payload).not.toContain("isCorrect");
    expect(response.json()).toMatchObject({
      item: { question: { options: [{ key: "A" }, { key: "B" }] } },
    });
  });

  it("requires an Idempotency-Key", async () => {
    const exam = await liveExam(3);
    const sessionId = await startedSession(studentA, exam.examId);
    const itemId = await currentItemId(studentA, sessionId);

    const response = await call(
      studentA,
      "POST",
      `/assessments/${sessionId}/items/${itemId}/answer`,
      {
        payload: { answer: { optionKey: CORRECT } },
      },
    );
    expect(response.statusCode).toBe(400);
    expect(errorCode(response)).toBe("VALIDATION_FAILED");
  });

  it("grades on the server and ignores a forged isCorrect", async () => {
    const exam = await liveExam(3);
    const sessionId = await startedSession(studentA, exam.examId);
    const itemId = await currentItemId(studentA, sessionId);

    const forged = await call(
      studentA,
      "POST",
      `/assessments/${sessionId}/items/${itemId}/answer`,
      {
        key: randomUUID(),
        payload: { answer: { optionKey: WRONG }, isCorrect: true },
      },
    );
    expect(forged.statusCode).toBe(400); // unknown field rejected outright

    const wrong = await answer(studentA, sessionId, itemId, WRONG);
    expect(wrong.json()).toMatchObject({ result: { isCorrect: false } });
  });

  it("records the attempt and its mastery evidence together", async () => {
    const exam = await liveExam(3);
    const sessionId = await startedSession(studentA, exam.examId);
    const itemId = await currentItemId(studentA, sessionId);

    const response = await answer(studentA, sessionId, itemId, CORRECT);
    expect(response.statusCode).toBe(200);
    const body = response.json<{ attemptId: string; progress: { answered: number } }>();
    expect(body).toMatchObject({
      result: { isCorrect: true },
      progress: { answered: 1 },
      next: { type: "QUESTION" },
    });

    const events = await e2eSql<{ reason_code: string; algorithm_version: string }[]>`
      SELECT reason_code, algorithm_version FROM mastery_events WHERE attempt_id = ${body.attemptId}`;
    expect(events).toEqual([{ reason_code: "CORRECT", algorithm_version: "mastery-v1.0" }]);

    const [state] = await e2eSql<
      { evidence_count: number; mastery_score: string; state: string }[]
    >`
      SELECT s.evidence_count, s.mastery_score, s.state FROM student_mastery_states s
      JOIN mastery_events e ON e.skill_id = s.skill_id AND e.student_id = s.student_id
      WHERE e.attempt_id = ${body.attemptId} AND s.student_id = ${studentAId}`;
    expect(state?.evidence_count).toBe(1);
    // One correct answer at difficulty 0.5 from the 2/2 prior: 3.125 / 5.125.
    expect(Number(state?.mastery_score)).toBeCloseTo(0.60976, 5);
    expect(state?.state).toBe("UNCERTAIN"); // one answer is never enough to judge
  });

  it("returns the original result for a retried request, and records nothing twice", async () => {
    const exam = await liveExam(3);
    const sessionId = await startedSession(studentA, exam.examId);
    const itemId = await currentItemId(studentA, sessionId);
    const key = randomUUID();

    const first = await answer(studentA, sessionId, itemId, CORRECT, key);
    const retry = await answer(studentA, sessionId, itemId, CORRECT, key);

    expect(retry.statusCode).toBe(200);
    expect(retry.json<{ attemptId: string }>().attemptId).toBe(
      first.json<{ attemptId: string }>().attemptId,
    );
    const [counts] = await e2eSql<{ attempts: number; events: number }[]>`
      SELECT (SELECT count(1) FROM question_attempts WHERE assessment_item_id = ${itemId})::int AS attempts,
             (SELECT count(1) FROM mastery_events e JOIN question_attempts a ON a.id = e.attempt_id
               WHERE a.assessment_item_id = ${itemId})::int AS events`;
    expect(counts).toEqual({ attempts: 1, events: 1 });
  });

  it("refuses a second answer to a finalized item, and a key reused for another item", async () => {
    const exam = await liveExam(3);
    const sessionId = await startedSession(studentA, exam.examId);
    const itemId = await currentItemId(studentA, sessionId);
    const key = randomUUID();
    await answer(studentA, sessionId, itemId, CORRECT, key);

    const again = await answer(studentA, sessionId, itemId, WRONG);
    expect(again.statusCode).toBe(409);
    expect(errorCode(again)).toBe("ASSESSMENT_ITEM_ALREADY_ANSWERED");

    const nextItem = await currentItemId(studentA, sessionId);
    const reused = await answer(studentA, sessionId, nextItem, CORRECT, key);
    expect(errorCode(reused)).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("accepts exactly one of two simultaneous answers to the same item", async () => {
    const exam = await liveExam(3);
    const sessionId = await startedSession(studentA, exam.examId);
    const itemId = await currentItemId(studentA, sessionId);

    const results = await Promise.all([
      answer(studentA, sessionId, itemId, CORRECT),
      answer(studentA, sessionId, itemId, WRONG),
    ]);

    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const [counts] = await e2eSql<{ attempts: number }[]>`
      SELECT count(1)::int AS attempts FROM question_attempts WHERE assessment_item_id = ${itemId}`;
    expect(counts?.attempts).toBe(1);
  });

  it("rejects an option that does not exist, recording nothing", async () => {
    const exam = await liveExam(3);
    const sessionId = await startedSession(studentA, exam.examId);
    const itemId = await currentItemId(studentA, sessionId);

    const response = await answer(studentA, sessionId, itemId, "Z");
    expect(response.statusCode).toBe(400);
    expect(errorCode(response)).toBe("INVALID_ANSWER");
    const [counts] = await e2eSql<{ n: number }[]>`
      SELECT count(1)::int AS n FROM question_attempts WHERE assessment_item_id = ${itemId}`;
    expect(counts?.n).toBe(0);
  });

  it("records a skip without any mastery evidence", async () => {
    const exam = await liveExam(3);
    const sessionId = await startedSession(studentA, exam.examId);
    const itemId = await currentItemId(studentA, sessionId);

    const response = await call(
      studentA,
      "POST",
      `/assessments/${sessionId}/items/${itemId}/skip`,
      {
        key: randomUUID(),
      },
    );
    expect(response.json()).toMatchObject({ result: { isCorrect: null } });
    const [counts] = await e2eSql<{ n: number }[]>`
      SELECT count(1)::int AS n FROM mastery_events e JOIN question_attempts a ON a.id = e.attempt_id
      WHERE a.assessment_item_id = ${itemId}`;
    expect(counts?.n).toBe(0);
  });
});

describe("completing", () => {
  it("completes on the last answer, reports the result, and is not offered again", async () => {
    const exam = await liveExam(1); // two questions in total: a short diagnostic
    const sessionId = await startedSession(studentA, exam.examId);

    const first = await answer(
      studentA,
      sessionId,
      await currentItemId(studentA, sessionId),
      CORRECT,
    );
    expect(first.json()).toMatchObject({ next: { type: "QUESTION" } });
    const last = await answer(studentA, sessionId, await currentItemId(studentA, sessionId), WRONG);
    expect(last.json()).toMatchObject({
      next: { type: "COMPLETED" },
      progress: { answered: 2, total: 2 },
    });

    const result = await call(studentA, "GET", `/assessments/${sessionId}/result`);
    expect(result.json()).toMatchObject({ score: { correct: 1, total: 2, percentage: 50 } });

    const again = await call(studentA, "POST", `/exams/${exam.examId}/assessments/mini-diagnostic`);
    expect(again.statusCode).toBe(409);
    expect(errorCode(again)).toBe("MINI_DIAGNOSTIC_ALREADY_COMPLETED");
    // The error names the student's own finished session, so the app can show its result.
    expect(again.json()).toMatchObject({ error: { details: { sessionId } } });
  });
});

/**
 * Answers every item of a started session in order. `plan` decides each
 * item's fate from its ordinal; returns the skill name behind each ordinal.
 */
async function finish(
  token: string,
  sessionId: string,
  plan: (ordinal: number) => "CORRECT" | "WRONG" | "SKIP",
): Promise<Map<number, string>> {
  const rows = await e2eSql<{ id: string; ordinal: number; skill: string }[]>`
    SELECT ai.id, ai.ordinal, COALESCE(s.name, parent.name) AS skill
    FROM assessment_items ai
    JOIN question_skill_mappings m ON m.question_version_id = ai.question_version_id AND m.role = 'PRIMARY'
    LEFT JOIN skills s ON s.id = m.skill_id
    LEFT JOIN subskills ss ON ss.id = m.subskill_id
    LEFT JOIN skills parent ON parent.id = ss.skill_id
    WHERE ai.session_id = ${sessionId} ORDER BY ai.ordinal`;

  for (const row of rows) {
    const fate = plan(row.ordinal);
    const response =
      fate === "SKIP"
        ? await call(token, "POST", `/assessments/${sessionId}/items/${row.id}/skip`, {
            key: randomUUID(),
          })
        : await answer(token, sessionId, row.id, fate === "CORRECT" ? CORRECT : WRONG);
    expect(response.statusCode).toBe(200);
  }
  return new Map(rows.map((r) => [r.ordinal, r.skill]));
}

/** OPEN_QUESTIONS.md #10b — what a student sees before paying, and nothing more. */
describe("the preliminary result", () => {
  it("is not available until the diagnostic is completed", async () => {
    const exam = await liveExam(1);
    const sessionId = await startedSession(studentA, exam.examId);

    const response = await call(studentA, "GET", `/assessments/${sessionId}/result`);
    expect(response.statusCode).toBe(422);
    expect(errorCode(response)).toBe("ASSESSMENT_NOT_COMPLETED");
  });

  it("shows score, level, two strengths, three weaknesses and the subscribe message", async () => {
    // Eight skills, one question each: fewer than 12, so every skill is asked once.
    const exam = await liveExam(1, { skillsPerDomain: 4 });
    const sessionId = await startedSession(studentA, exam.examId);
    // 1–3 correct (three strengths), 4–7 wrong (four weaknesses), 8 skipped.
    const skillAt = await finish(studentA, sessionId, (ordinal) =>
      ordinal <= 3 ? "CORRECT" : ordinal <= 7 ? "WRONG" : "SKIP",
    );
    expect(skillAt.size).toBe(8);

    const response = await call(studentA, "GET", `/assessments/${sessionId}/result`);
    expect(response.statusCode).toBe(200);
    const veryGood = { code: "VERY_GOOD", label: "جيد جدًا" };
    const needsTraining = { code: "NEEDS_TRAINING", label: "يحتاج تدريب" };
    expect(response.json()).toEqual({
      kind: "PRELIMINARY",
      score: { correct: 3, total: 8, percentage: 38 },
      level: { code: "NEEDS_FOUNDATION", label: "يحتاج تأسيس" },
      strengths: [
        { skill: skillAt.get(1), rating: veryGood },
        { skill: skillAt.get(2), rating: veryGood },
      ],
      weaknesses: [
        { skill: skillAt.get(4), rating: needsTraining },
        { skill: skillAt.get(5), rating: needsTraining },
        { skill: skillAt.get(6), rating: needsTraining },
      ],
      nextStep: { type: "SUBSCRIBE", message: expect.stringContaining("التشخيص الكامل") },
    });

    // The rest of the skill map stays behind the paywall (PRD §7): the third
    // strength, the fourth weakness and the skipped skill are never named,
    // and no skill is identified by id.
    for (const hidden of [3, 7, 8]) {
      expect(response.payload).not.toContain(skillAt.get(hidden));
    }
    for (const skillId of exam.skillIds) expect(response.payload).not.toContain(skillId);
  });

  it("keeps a finished session's level when the boundaries change later", async () => {
    const KEY = "assessment.preliminaryResult.levels";
    const exam = await liveExam(1, { skillsPerDomain: 4 });
    const threeOfEight = (ordinal: number) =>
      ordinal <= 3 ? "CORRECT" : ordinal <= 7 ? "WRONG" : ("SKIP" as const);
    const levelOf = async (token: string, sessionId: string) =>
      (await call(token, "GET", `/assessments/${sessionId}/result`)).json<{
        level: { code: string };
      }>().level.code;

    const first = await startedSession(studentA, exam.examId);
    await finish(studentA, first, threeOfEight); // 38%
    const before = await levelOf(studentA, first);

    // An admin lowers BEGINNER to 30%: 38% is now BEGINNER for new sessions.
    const { version: startVersion } = await one(
      e2eSql<{ version: number }[]>`
        SELECT coalesce(max(version), 0)::int AS version FROM system_settings WHERE key = ${KEY}`,
    );
    const lowered = [0, 30, 55, 70, 85].map((fromPercentage, index) => ({
      level: ["NEEDS_FOUNDATION", "BEGINNER", "INTERMEDIATE", "GOOD", "ADVANCED"][index],
      fromPercentage,
    }));
    await e2eSql`
      INSERT INTO system_settings (key, value_type, value, version, description)
      VALUES (${KEY}, 'JSON', ${e2eSql.json(lowered)}, ${startVersion + 1}, 'e2e')`;
    try {
      expect(before).toBe("NEEDS_FOUNDATION");
      expect(await levelOf(studentA, first)).toBe(before);

      const second = await startedSession(studentB, exam.examId);
      const { result_config_version } = await one(
        e2eSql<{ result_config_version: number | null }[]>`
          SELECT result_config_version FROM assessment_sessions WHERE id = ${second}`,
      );
      expect(result_config_version).toBe(startVersion + 1);
      await finish(studentB, second, threeOfEight);
      expect(await levelOf(studentB, second)).toBe("BEGINNER");
    } finally {
      await e2eSql`DELETE FROM system_settings WHERE key = ${KEY} AND version > ${startVersion}`;
    }
  });

  it("reports a question mapped to a subskill under its parent skill", async () => {
    const exam = await liveExam(2, { viaSubskills: true });
    const sessionId = await startedSession(studentA, exam.examId);
    await finish(studentA, sessionId, () => "CORRECT");

    const body = (await call(studentA, "GET", `/assessments/${sessionId}/result`)).json<{
      score: object;
      level: { code: string };
      strengths: { skill: string }[];
    }>();
    expect(body.score).toEqual({ correct: 4, total: 4, percentage: 100 });
    expect(body.level.code).toBe("ADVANCED");
    expect(body.strengths.map((s) => s.skill).sort()).toEqual(["QUANT-S1", "VERBAL-S1"]);
  });

  it("stops inviting a student to subscribe once they have access to the exam", async () => {
    const exam = await liveExam(1);
    const sessionId = await startedSession(studentA, exam.examId);
    await finish(studentA, sessionId, () => "CORRECT");
    const nextStep = async () =>
      (await call(studentA, "GET", `/assessments/${sessionId}/result`)).json<{
        nextStep: { type: string } | null;
      }>().nextStep;
    expect(await nextStep()).toMatchObject({ type: "SUBSCRIBE" });

    await e2eSql`
      INSERT INTO entitlements (student_id, exam_id, source, starts_at)
      VALUES (${studentAId}, ${exam.examId}, 'ADMIN', now() - interval '1 minute')`;

    expect(await nextStep()).toBeNull();
  });

  it("is hidden from another student (no IDOR)", async () => {
    const exam = await liveExam(1);
    const sessionId = await startedSession(studentA, exam.examId);
    await finish(studentA, sessionId, () => "CORRECT");

    const response = await call(studentB, "GET", `/assessments/${sessionId}/result`);
    expect(response.statusCode).toBe(404);
    expect(errorCode(response)).toBe("ASSESSMENT_NOT_FOUND");
  });
});
