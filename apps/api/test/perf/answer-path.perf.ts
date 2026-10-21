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
 * C4 (IMPLEMENTATION_PLAN.md Phase 10, "load/performance profiling"): the
 * answer path under concurrent students. Each answer locks the session and
 * the mastery rows it updates, in one transaction (ARCHITECTURE.md §7).
 * Runs the real application in-process against the test database, so it
 * measures the API and PostgreSQL, not the network.
 */

/** Concurrent students; PERF_STUDENTS raises it for a heavier run. */
const STUDENTS = Number(process.env.PERF_STUDENTS ?? 20);
const QUESTIONS_PER_SKILL = 10;
/** The budget the answer path must stay under at the 95th percentile. */
const P95_BUDGET_MS = 500;
const COOKIE = "qup_session";
const PASSWORD = "performance check passphrase";

let app: NestFastifyApplication;
let exam: LiveExam;

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;
}

async function student(): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email: e2eEmail("perf"), password: PASSWORD },
  });
  return response.cookies.find((c) => c.name === COOKIE)?.value ?? "";
}

/** Takes a mini diagnostic to the end; returns the latency of every answer. */
async function takeDiagnostic(token: string): Promise<number[]> {
  const call = (method: "GET" | "POST", url: string, payload?: object) =>
    app.inject({
      method,
      url: `/api/v1${url}`,
      cookies: { [COOKIE]: token },
      headers: url.includes("/answer") ? { "idempotency-key": randomUUID() } : {},
      ...(payload ? { payload: payload as Record<string, unknown> } : {}),
    });
  const session = (await call("POST", `/exams/${exam.examId}/assessments/mini-diagnostic`)).json<{
    id: string;
  }>().id;
  await call("POST", `/assessments/${session}/start`);
  const latencies: number[] = [];
  for (;;) {
    const item = (await call("GET", `/assessments/${session}/current-item`)).json<{
      item: { id: string } | null;
    }>().item;
    if (!item) return latencies;
    const started = performance.now();
    const answer = await call("POST", `/assessments/${session}/items/${item.id}/answer`, {
      answer: { optionKey: latencies.length % 3 === 0 ? "A" : "B" },
    });
    latencies.push(performance.now() - started);
    expect(answer.statusCode).toBe(200);
  }
}

beforeAll(async () => {
  await purgeE2eCatalog();
  await deleteE2eUsers();
  ({ app } = await buildTestApp({
    config: testConfig({
      DATABASE_URL: E2E_DATABASE_URL,
      AUTH_RATE_LIMIT_PER_MINUTE: "100000",
      RATE_LIMIT_PER_MINUTE: "100000",
    }),
  }));
  exam = await liveExam(QUESTIONS_PER_SKILL);
});

afterAll(async () => {
  await app.close();
  await purgeE2eCatalog();
  await deleteE2eUsers();
  await e2eSql.end();
});

describe("answer path", () => {
  it(`keeps p95 under ${P95_BUDGET_MS} ms with ${STUDENTS} students answering at once`, async () => {
    const tokens = await Promise.all(Array.from({ length: STUDENTS }, () => student()));
    const started = performance.now();
    const latencies = (await Promise.all(tokens.map(takeDiagnostic))).flat().sort((a, b) => a - b);
    const seconds = (performance.now() - started) / 1000;

    const report = {
      students: STUDENTS,
      answers: latencies.length,
      throughputPerSecond: Number((latencies.length / seconds).toFixed(1)),
      p50Ms: Math.round(percentile(latencies, 50)),
      p95Ms: Math.round(percentile(latencies, 95)),
      maxMs: Math.round(latencies.at(-1) ?? 0),
    };
    console.info(`answer-path ${JSON.stringify(report)}`);
    expect(latencies.length).toBeGreaterThan(STUDENTS);
    expect(report.p95Ms).toBeLessThan(P95_BUDGET_MS);
  });
});
