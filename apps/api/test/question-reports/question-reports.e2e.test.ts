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
import { liveExam } from "../support/live-exam.js";
import { buildTestApp, testConfig } from "../support/test-app.js";

/** Students report problems in questions they were shown; reviewers close the reports. */

const COOKIE = "qup_session";
const PASSWORD = "reports passphrase";

let app: NestFastifyApplication;
let admin: string;

async function register(label: string) {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email: e2eEmail(label), password: PASSWORD },
  });
  return response.cookies.find((c) => c.name === COOKIE)?.value ?? "";
}

function call(token: string | null, method: "GET" | "POST", url: string, payload?: object) {
  return app.inject({
    method,
    url: `/api/v1${url}`,
    ...(token === null ? {} : { cookies: { [COOKIE]: token } }),
    ...(payload ? { payload: payload as Record<string, unknown> } : {}),
  });
}

const errorCode = (r: { json: () => unknown }) =>
  (r.json() as { error: { code: string } }).error.code;

/** A student in a mini diagnostic, with the item they were shown and one they were not. */
async function shownItem(label: string) {
  const exam = await liveExam(3);
  const token = await register(label);
  const sessionId = (
    await call(token, "POST", `/exams/${exam.examId}/assessments/mini-diagnostic`)
  ).json<{ id: string }>().id;
  await call(token, "POST", `/assessments/${sessionId}/start`);
  const current = (await call(token, "GET", `/assessments/${sessionId}/current-item`)).json<{
    item: { id: string };
  }>();
  const [unseen] = await e2eSql<{ id: string }[]>`
    SELECT id FROM assessment_items WHERE session_id = ${sessionId} AND presented_at IS NULL LIMIT 1`;
  return { token, sessionId, itemId: current.item.id, unseenId: unseen?.id ?? "" };
}

beforeAll(async () => {
  await purgeE2eCatalog();
  await deleteE2eUsers();
  ({ app } = await buildTestApp({
    config: testConfig({ DATABASE_URL: E2E_DATABASE_URL, AUTH_RATE_LIMIT_PER_MINUTE: "10000" }),
  }));
  const email = e2eEmail("reports-admin");
  await app.get(AdminBootstrapService).ensureAdmin({ email, password: PASSWORD });
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { identifier: email, password: PASSWORD },
  });
  admin = login.cookies.find((c) => c.name === COOKIE)?.value ?? "";
});

afterAll(async () => {
  await app.close();
  await purgeE2eCatalog();
  await deleteE2eUsers();
  await e2eSql.end();
});

describe("question reports", () => {
  it("records one open report per student and question, for questions they were shown", async () => {
    const { token, sessionId, itemId, unseenId } = await shownItem("reports-student");
    const url = `/assessments/${sessionId}/items/${itemId}/reports`;

    const first = await call(token, "POST", url, {
      reason: "TYPO",
      note: "خطأ إملائي في الخيار ب",
    });
    expect(first.statusCode, first.payload).toBe(201);
    expect(first.json()).toMatchObject({ reason: "TYPO", status: "OPEN" });
    const again = await call(token, "POST", url, { reason: "OTHER" });
    expect(again.statusCode).toBe(200);
    expect(again.json<{ id: string }>().id).toBe(first.json<{ id: string }>().id);

    const unseen = await call(
      token,
      "POST",
      `/assessments/${sessionId}/items/${unseenId}/reports`,
      {
        reason: "TYPO",
      },
    );
    expect(unseen.statusCode).toBe(404);
    const other = await register("reports-other");
    const foreign = await call(other, "POST", url, { reason: "TYPO" });
    expect(foreign.statusCode).toBe(404);
    expect(errorCode(foreign)).toBe("ASSESSMENT_ITEM_NOT_FOUND");
    expect((await call(token, "POST", url, { reason: "NOPE" })).statusCode).toBe(400);
    expect((await call(null, "POST", url, { reason: "TYPO" })).statusCode).toBe(401);
  });

  it("lets reviewers list and close reports, once", async () => {
    const { token, sessionId, itemId } = await shownItem("reports-close");
    const created = await call(token, "POST", `/assessments/${sessionId}/items/${itemId}/reports`, {
      reason: "WRONG_ANSWER",
    });
    const reportId = created.json<{ id: string }>().id;

    expect((await call(token, "GET", "/admin/question-reports")).statusCode).toBe(403);
    const listed = await call(admin, "GET", "/admin/question-reports?status=OPEN");
    expect(listed.statusCode).toBe(200);
    const body = listed.json<{
      items: { id: string; stemPreview: string; reporter: { email: string | null } }[];
      openCount: number;
    }>();
    const ours = body.items.find((item) => item.id === reportId);
    expect(ours?.stemPreview.length).toBeGreaterThan(0);
    expect(ours?.reporter.email).toMatch(/^reports-close-/);
    expect(body.openCount).toBeGreaterThanOrEqual(1);

    const closed = await call(admin, "POST", `/admin/question-reports/${reportId}/close`, {
      status: "RESOLVED",
      note: "صُحّح المفتاح في نسخة جديدة",
    });
    expect(closed.statusCode).toBe(200);
    expect(closed.json()).toMatchObject({ status: "RESOLVED", resolutionNote: expect.any(String) });
    const twice = await call(admin, "POST", `/admin/question-reports/${reportId}/close`, {
      status: "DISMISSED",
    });
    expect(twice.statusCode).toBe(409);
    expect(errorCode(twice)).toBe("QUESTION_REPORT_CLOSED");
    const missing = await call(admin, "POST", `/admin/question-reports/${randomUUID()}/close`, {
      status: "DISMISSED",
    });
    expect(missing.statusCode).toBe(404);

    // Closed: the student may report the same question again.
    const reopened = await call(
      token,
      "POST",
      `/assessments/${sessionId}/items/${itemId}/reports`,
      {
        reason: "UNCLEAR_QUESTION",
      },
    );
    expect(reopened.statusCode).toBe(201);
  });
});
