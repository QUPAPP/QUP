import { randomUUID } from "node:crypto";
import type { INestApplicationContext } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { Database } from "@qup/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DATABASE } from "../../src/infrastructure/database/database.module.js";
import { OutboxEventType, writeOutbox } from "../../src/infrastructure/outbox/outbox.js";
import {
  OUTBOX_CONFIG,
  type OutboxHandler,
  OutboxRelay,
} from "../../src/infrastructure/outbox/outbox-relay.js";
import { WorkerModule } from "../../src/worker/worker.module.js";
import {
  deleteE2eUsers,
  E2E_DATABASE_URL,
  e2eEmail,
  e2eSql,
  purgeE2eCatalog,
} from "../support/e2e-database.js";
import { liveExam } from "../support/live-exam.js";
import { buildTestApp, LogCapture, testConfig } from "../support/test-app.js";

/** ARCHITECTURE.md §10, AGENTS.md §7: business write + outbox in one transaction; a worker drains. */

const COOKIE = "qup_session";
const PASSWORD = "outbox passphrase";
const quiet = { info: () => {}, warn: () => {}, error: () => {} };

let app: NestFastifyApplication;
let worker: INestApplicationContext;
let relay: OutboxRelay;
let db: Database;

function call(token: string, method: "GET" | "POST", url: string, payload?: object) {
  return app.inject({
    method,
    url: `/api/v1${url}`,
    cookies: { [COOKIE]: token },
    headers: url.includes("/items/") ? { "idempotency-key": randomUUID() } : {},
    ...(payload ? { payload: payload as Record<string, unknown> } : {}),
  });
}

async function eventsOf(aggregateId: string) {
  return e2eSql<{ id: string; event_type: string; status: string; attempts: number }[]>`
    SELECT id, event_type, status, attempts FROM outbox_events
    WHERE aggregate_id = ${aggregateId} ORDER BY created_at, event_type`;
}

async function insertEvent(
  eventType: string,
  overrides: { status?: string; minutesAgo?: number } = {},
) {
  const [row] = await e2eSql<{ id: string }[]>`
    INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, status, available_at)
    VALUES ('test', ${randomUUID()}, ${eventType}, ${e2eSql.json({ note: "test" })},
            ${overrides.status ?? "PENDING"}::outbox_status,
            now() - make_interval(mins => ${overrides.minutesAgo ?? 0}))
    RETURNING id`;
  if (!row) throw new Error("no row");
  return row.id;
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
  relay = worker.get(OutboxRelay);
  db = worker.get<Database>(DATABASE);
});

afterAll(async () => {
  await e2eSql`DELETE FROM outbox_events WHERE aggregate_type = 'test'`;
  await app.close();
  await worker.close();
  await purgeE2eCatalog();
  await deleteE2eUsers();
  await e2eSql.end();
});

describe("transactional outbox", () => {
  it("records events with each answer and completion, and projects them once", async () => {
    const exam = await liveExam(1);
    const registered = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email: e2eEmail("outbox-student"), password: PASSWORD },
    });
    const token = registered.cookies.find((c) => c.name === COOKIE)?.value ?? "";
    const studentId = registered.json<{ user: { id: string } }>().user.id;
    const sessionId = (
      await call(token, "POST", `/exams/${exam.examId}/assessments/mini-diagnostic`)
    ).json<{ id: string }>().id;
    await call(token, "POST", `/assessments/${sessionId}/start`);
    for (;;) {
      const item = (await call(token, "GET", `/assessments/${sessionId}/current-item`)).json<{
        item: { id: string } | null;
      }>().item;
      if (!item) break;
      await call(token, "POST", `/assessments/${sessionId}/items/${item.id}/answer`, {
        answer: { optionKey: "B" },
      });
    }

    const pending = await eventsOf(sessionId);
    expect(pending.map((e) => [e.event_type, e.status])).toEqual([
      [OutboxEventType.AttemptRecorded, "PENDING"],
      [OutboxEventType.AttemptRecorded, "PENDING"],
      [OutboxEventType.SessionCompleted, "PENDING"],
    ]);

    // Two workers at once never handle the same event.
    await Promise.all([relay.drain(), relay.drain()]);
    await relay.drain();
    const published = await eventsOf(sessionId);
    expect(published.every((e) => e.status === "PUBLISHED")).toBe(true);
    const projected = await e2eSql<
      { event_type: string; student_id: string; schema_version: string }[]
    >`
      SELECT event_type, student_id, schema_version FROM learning_events
      WHERE id IN ${e2eSql(published.map((e) => e.id))}`;
    expect(projected).toHaveLength(3);
    expect(projected.every((e) => e.student_id === studentId && e.schema_version === "1")).toBe(
      true,
    );
  });

  it("writes nothing when the business transaction rolls back", async () => {
    const aggregateId = randomUUID();
    await expect(
      db.transaction(async (tx) => {
        await writeOutbox(tx, {
          type: OutboxEventType.SessionCompleted,
          aggregateType: "test",
          aggregateId,
          payload: { sessionId: aggregateId },
        });
        throw new Error("the business change failed");
      }),
    ).rejects.toThrow("the business change failed");
    expect(await eventsOf(aggregateId)).toEqual([]);
  });

  it("retries a failing handler with backoff, keeps going, and gives up at the maximum", async () => {
    const failing: OutboxHandler = {
      handles: ["test.fails"],
      handle: async () => {
        throw new Error("downstream unavailable");
      },
    };
    const fine: OutboxHandler = { handles: ["test.works"], handle: async () => {} };
    const testRelay = new OutboxRelay(db, [failing, fine], quiet);
    const bad = await insertEvent("test.fails");
    const good = await insertEvent("test.works");

    await testRelay.drain();
    const [afterFirst] = await e2eSql<
      { status: string; attempts: number; last_error: string; due_in: number }[]
    >`
      SELECT status, attempts, last_error,
             extract(epoch from available_at - now()) AS due_in
      FROM outbox_events WHERE id = ${bad}`;
    expect(afterFirst).toMatchObject({ status: "PENDING", attempts: 1 });
    expect(afterFirst?.last_error).toContain("downstream unavailable");
    expect(Number(afterFirst?.due_in)).toBeGreaterThan(0);
    const [other] = await e2eSql<
      { status: string }[]
    >`SELECT status FROM outbox_events WHERE id = ${good}`;
    expect(other?.status).toBe("PUBLISHED");

    await e2eSql`
      UPDATE outbox_events SET attempts = ${OUTBOX_CONFIG.maxAttempts - 1}, available_at = now()
      WHERE id = ${bad}`;
    await testRelay.drain();
    const [final] = await e2eSql<{ status: string; attempts: number }[]>`
      SELECT status, attempts FROM outbox_events WHERE id = ${bad}`;
    expect(final).toEqual({ status: "FAILED", attempts: OUTBOX_CONFIG.maxAttempts });
  });

  it("takes back an event whose worker stopped mid-way", async () => {
    const handled: string[] = [];
    const testRelay = new OutboxRelay(
      db,
      [{ handles: ["test.stuck"], handle: async (event) => void handled.push(event.id) }],
      quiet,
    );
    // Claimed by a worker that died: its lease ran out a minute ago.
    const stuck = await insertEvent("test.stuck", { status: "PROCESSING", minutesAgo: 1 });
    await testRelay.drain();
    expect(handled).toContain(stuck);
    const [row] = await e2eSql<
      { status: string }[]
    >`SELECT status FROM outbox_events WHERE id = ${stuck}`;
    expect(row?.status).toBe("PUBLISHED");
  });
});
