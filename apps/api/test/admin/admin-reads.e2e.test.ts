import { randomUUID } from "node:crypto";
import type { INestApplicationContext } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OutboxRelay } from "../../src/infrastructure/outbox/outbox-relay.js";
import { AdminBootstrapService } from "../../src/modules/auth/application/admin-bootstrap.service.js";
import { WorkerModule } from "../../src/worker/worker.module.js";
import {
  deleteE2eUsers,
  E2E_DATABASE_URL,
  e2eEmail,
  e2eSql,
  grantRole,
  purgeE2eCatalog,
} from "../support/e2e-database.js";
import { type LiveExam, liveExam } from "../support/live-exam.js";
import { buildTestApp, LogCapture, testConfig } from "../support/test-app.js";

/** C2: OBSERVABILITY.md metrics and decision audit; API_CONTRACTS.md "Admin Analytics/Audit". */

const COOKIE = "qup_session";
const PASSWORD = "admin reads passphrase";

let app: NestFastifyApplication;
let worker: INestApplicationContext;
let admin: { token: string; id: string };
let manager: string;
let student: { token: string; id: string };
let exam: LiveExam;
let trainingId: string;

function call(token: string | null, method: "GET" | "POST", url: string, payload?: object) {
  return app.inject({
    method,
    url: `/api/v1${url}`,
    ...(token === null ? {} : { cookies: { [COOKIE]: token } }),
    headers: url.includes("/items/") ? { "idempotency-key": randomUUID() } : {},
    ...(payload ? { payload: payload as Record<string, unknown> } : {}),
  });
}

async function signIn(email: string): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { identifier: email, password: PASSWORD },
  });
  return response.cookies.find((c) => c.name === COOKIE)?.value ?? "";
}

async function register(label: string) {
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

/** Starts the session and answers every item: the first wrong, the rest right. */
async function answerAll(token: string, sessionId: string, limit = Number.POSITIVE_INFINITY) {
  await call(token, "POST", `/assessments/${sessionId}/start`);
  for (let n = 0; n < limit; n++) {
    const item = (await call(token, "GET", `/assessments/${sessionId}/current-item`)).json<{
      item: { id: string } | null;
    }>().item;
    if (!item) return;
    await call(token, "POST", `/assessments/${sessionId}/items/${item.id}/answer`, {
      answer: { optionKey: n === 0 ? "A" : "B" },
    });
  }
}

beforeAll(async () => {
  await purgeE2eCatalog();
  await deleteE2eUsers();
  const config = testConfig({
    DATABASE_URL: E2E_DATABASE_URL,
    AUTH_RATE_LIMIT_PER_MINUTE: "10000",
  });
  ({ app } = await buildTestApp({ config }));
  worker = await NestFactory.createApplicationContext(
    WorkerModule.forRoot(config, { logDestination: new LogCapture() }),
    { logger: false },
  );

  const adminEmail = e2eEmail("reads-admin");
  const adminId = (
    await app.get(AdminBootstrapService).ensureAdmin({ email: adminEmail, password: PASSWORD })
  ).userId;
  admin = { token: await signIn(adminEmail), id: adminId };
  const managerEmail = e2eEmail("reads-manager");
  const registeredManager = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email: managerEmail, password: PASSWORD },
  });
  await grantRole(registeredManager.json<{ user: { id: string } }>().user.id, "CONTENT_MANAGER");
  manager = await signIn(managerEmail);
  student = await register("reads-student");

  // 20 questions: the mini diagnostic takes 12, training still has unseen ones.
  exam = await liveExam(10);
  // 4 published questions a skill: below the thin-skill line.
  await liveExam(4);
  const mini = (
    await call(student.token, "POST", `/exams/${exam.examId}/assessments/mini-diagnostic`)
  ).json<{ id: string }>().id;
  await answerAll(student.token, mini);
  await e2eSql`
    INSERT INTO entitlements (student_id, exam_id, source, starts_at)
    VALUES (${student.id}, ${exam.examId}, 'ADMIN', now() - interval '1 day')`;
  trainingId = (
    await call(student.token, "POST", `/exams/${exam.examId}/assessments/training`)
  ).json<{ id: string }>().id;
  await answerAll(student.token, trainingId, 2);
  await worker.get(OutboxRelay).drain(1000);
});

afterAll(async () => {
  await app.close();
  await worker.close();
  await purgeE2eCatalog();
  await deleteE2eUsers();
  await e2eSql.end();
});

describe("admin reads", () => {
  it.each([
    "/admin/audit-logs",
    "/admin/operations/outbox",
    "/admin/analytics/learning?days=7",
    "/admin/analytics/content",
    "/admin/analytics/imports?days=7",
    `/admin/adaptive-decisions?sessionId=${randomUUID()}`,
  ])("%s is for admins only", async (url) => {
    expect((await call(null, "GET", url)).statusCode).toBe(401);
    expect((await call(student.token, "GET", url)).statusCode).toBe(403);
    expect((await call(manager, "GET", url)).statusCode).toBe(403);
  });

  it("filters the audit log and names the actor", async () => {
    const probe = randomUUID();
    await e2eSql`
      INSERT INTO audit_logs (actor_id, action, resource_type, resource_id, metadata_redacted)
      VALUES (${admin.id}, 'test.read', 'probe', ${probe}, ${e2eSql.json({ note: "e2e" })})`;
    const response = await call(
      admin.token,
      "GET",
      `/admin/audit-logs?resourceType=probe&resourceId=${probe}&limit=5`,
    );
    expect(response.statusCode).toBe(200);
    const body = response.json<{
      items: {
        action: string;
        resourceId: string;
        actor: { id: string } | null;
        metadata: unknown;
      }[];
      page: { hasMore: boolean };
    }>();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      action: "test.read",
      resourceId: probe,
      actor: { id: admin.id },
      metadata: { note: "e2e" },
    });
    // The audit log is append-only by trigger (0001); test rows are removed the way purges do.
    await e2eSql.begin(async (tx) => {
      await tx`SET LOCAL session_replication_role = replica`;
      await tx`DELETE FROM audit_logs WHERE resource_type = 'probe'`;
    });
  });

  it("explains every question a training session chose", async () => {
    const response = await call(
      admin.token,
      "GET",
      `/admin/adaptive-decisions?sessionId=${trainingId}`,
    );
    expect(response.statusCode).toBe(200);
    const body = response.json<{
      session: { id: string; type: string; examName: string };
      items: {
        itemOrdinal: number;
        targetSkill: { name: string };
        reasons: string[];
        candidates: unknown[];
        engineVersion: string;
      }[];
    }>();
    expect(body.session).toMatchObject({ id: trainingId, type: "ADAPTIVE_TRAINING" });
    expect(body.items.map((d) => d.itemOrdinal)).toEqual([1, 2]);
    expect(body.items[0]?.engineVersion).toBe("adaptive-v1.0");
    expect(body.items[0]?.reasons.length).toBeGreaterThan(0);
    expect(body.items[0]?.candidates.length).toBeGreaterThan(0);
    expect(response.payload).not.toContain("isCorrect");
  });

  it("counts learning from the event stream", async () => {
    const bad = await call(admin.token, "GET", "/admin/analytics/learning?days=3");
    expect(bad.statusCode).toBe(400);
    const response = await call(admin.token, "GET", "/admin/analytics/learning?days=7");
    const body = response.json<{
      days: number;
      activeStudents: number;
      diagnostics: Record<string, number>;
      trainingSessions: number;
      attempts: { answered: number; skipped: number; correctRate: number | null };
    }>();
    expect(body.days).toBe(7);
    expect(body.activeStudents).toBeGreaterThanOrEqual(1);
    expect(body.diagnostics.miniStarted).toBeGreaterThanOrEqual(1);
    expect(body.diagnostics.miniCompleted).toBeGreaterThanOrEqual(1);
    expect(body.trainingSessions).toBeGreaterThanOrEqual(1);
    expect(body.attempts.answered).toBeGreaterThanOrEqual(10);
    expect(body.attempts.correctRate).toBeGreaterThan(0);
    expect(body.attempts.correctRate).toBeLessThan(1);
  });

  it("shows the content backlog and thin skills", async () => {
    const body = (await call(admin.token, "GET", "/admin/analytics/content")).json<{
      questions: Record<string, number>;
      reviewBacklog: number;
      thinSkills: { examName: string; skillName: string; published: number }[];
    }>();
    expect(body.questions.PUBLISHED).toBeGreaterThanOrEqual(8);
    expect(body.reviewBacklog).toBeGreaterThanOrEqual(0);
    const thin = body.thinSkills.filter((s) => s.examName === "تشخيص");
    expect(thin.map((s) => [s.skillName, s.published]).sort()).toEqual([
      ["QUANT-S1", 4],
      ["VERBAL-S1", 4],
    ]);
  });

  it("reports imports and the outbox", async () => {
    const imports = await call(admin.token, "GET", "/admin/analytics/imports?days=30");
    expect(imports.statusCode).toBe(200);
    expect(imports.json()).toMatchObject({
      days: 30,
      batches: expect.any(Object),
      rows: { imported: expect.any(Number), invalid: expect.any(Number) },
    });
    const outbox = (await call(admin.token, "GET", "/admin/operations/outbox")).json<{
      pending: number;
      failed: number;
      published24h: number;
      recentFailures: unknown[];
    }>();
    expect(outbox.published24h).toBeGreaterThanOrEqual(1);
    expect(outbox).toMatchObject({ recentFailures: expect.any(Array) });
  });
});
