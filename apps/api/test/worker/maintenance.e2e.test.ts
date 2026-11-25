import { randomUUID } from "node:crypto";

import type { INestApplicationContext } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { RetentionSweeper } from "../../src/infrastructure/maintenance/retention-sweeper.js";
import { OutboxRelay } from "../../src/infrastructure/outbox/outbox-relay.js";
import { MaintenanceScheduler } from "../../src/worker/maintenance-scheduler.js";
import { WorkerModule } from "../../src/worker/worker.module.js";
import {
  deleteE2eUsers,
  E2E_DATABASE_URL,
  e2eEmail,
  e2eExamCode,
  e2eSql,
  purgeE2eCatalog,
} from "../support/e2e-database.js";
import {
  FAKE_OTP_SECRET,
  FAKE_SNDR_API_KEY,
  FAKE_SNDR_FROM,
  type FakeSndr,
  startFakeSndr,
} from "../support/fake-sndr.js";
import { LogCapture, testConfig } from "../support/test-app.js";

/**
 * The worker's periodic jobs against a real database: retention deletes only
 * what is past its time, and "ends soon" reminders go out once per period.
 */

let sndr: FakeSndr;
let worker: INestApplicationContext;
let scheduler: MaintenanceScheduler;
let relay: OutboxRelay;
const students: string[] = [];

async function student(label: string) {
  const email = e2eEmail(label);
  const [row] = await e2eSql<{ id: string }[]>`
    INSERT INTO users (email, password_hash) VALUES (${email}, 'not-a-real-hash') RETURNING id`;
  if (!row) throw new Error("user insert returned no row");
  students.push(row.id);
  return { id: row.id, email };
}

async function exam(name: string) {
  const [row] = await e2eSql<{ id: string }[]>`
    INSERT INTO exams (code, slug, name_ar, status)
    VALUES (${e2eExamCode()}, ${`e2e-m-${randomUUID().slice(0, 8)}`}, ${name}, 'ACTIVE')
    RETURNING id`;
  if (!row) throw new Error("exam insert returned no row");
  return row.id;
}

/** An admin-granted entitlement whose period ends `endsInHours` from now (null: never). */
async function entitlement(studentId: string, examId: string, endsInHours: number | null) {
  const endsAt = endsInHours === null ? null : new Date(Date.now() + endsInHours * 3_600_000);
  const [row] = await e2eSql<{ id: string }[]>`
    INSERT INTO entitlements (student_id, exam_id, source, starts_at, ends_at, status)
    VALUES (${studentId}, ${examId}, 'ADMIN', now() - interval '30 days', ${endsAt}, 'ACTIVE')
    RETURNING id`;
  if (!row) throw new Error("entitlement insert returned no row");
  return row.id;
}

const remindedAt = async (id: string) =>
  (
    await e2eSql<{ at: Date | null }[]>`
      SELECT ending_reminder_queued_at AS at FROM entitlements WHERE id = ${id}`
  )[0]?.at ?? null;

beforeAll(async () => {
  await purgeE2eCatalog();
  await deleteE2eUsers();
  sndr = await startFakeSndr();
  worker = await NestFactory.createApplicationContext(
    WorkerModule.forRoot(
      testConfig({
        DATABASE_URL: E2E_DATABASE_URL,
        SNDR_API_KEY: FAKE_SNDR_API_KEY,
        SNDR_FROM: FAKE_SNDR_FROM,
        SNDR_API_BASE_URL: sndr.baseUrl,
        OTP_SECRET: FAKE_OTP_SECRET,
        APP_PUBLIC_URL: "https://qupedu.com",
      }),
      { logDestination: new LogCapture() },
    ),
    { logger: false },
  );
  scheduler = worker.get(MaintenanceScheduler);
  relay = worker.get(OutboxRelay);
});

afterAll(async () => {
  if (students.length > 0) {
    await e2eSql`DELETE FROM entitlements WHERE student_id IN ${e2eSql(students)}`;
  }
  await worker.close();
  await sndr.close();
  await purgeE2eCatalog();
  await deleteE2eUsers();
  await e2eSql.end();
});

describe("subscription ending reminders", () => {
  it("mails a student whose subscription ends within three days, once", async () => {
    const person = await student("ending");
    const examId = await exam("القدرات التجريبي");
    const ending = await entitlement(person.id, examId, 48);

    await scheduler.runOnce();
    await relay.drain();

    const mails = sndr.to(person.email);
    expect(mails).toHaveLength(1);
    expect(mails[0]?.body.subject).toBe("اشتراكك في «القدرات التجريبي» ينتهي قريبًا");
    expect(mails[0]?.body.text).toContain("https://qupedu.com/subscriptions");
    expect(mails[0]?.idempotencyKey).toBe(`subscription-ending:${ending}`);
    expect(await remindedAt(ending)).toBeInstanceOf(Date);

    // The next hourly run finds nothing new for this period.
    await scheduler.runOnce();
    await relay.drain();
    expect(sndr.to(person.email)).toHaveLength(1);
  });

  it("stays quiet when the subscription was renewed, ends later, or never ends", async () => {
    const renewed = await student("renewed");
    const examId = await exam("التحصيلي التجريبي");
    const old = await entitlement(renewed.id, examId, 24);
    await entitlement(renewed.id, examId, 24 * 120);

    const later = await student("later");
    const laterOne = await entitlement(later.id, examId, 24 * 10);
    const forever = await student("forever");
    await entitlement(forever.id, examId, null);

    await scheduler.runOnce();
    await relay.drain();

    expect(sndr.to(renewed.email)).toHaveLength(0);
    // Marked anyway, so it is not looked at again every hour.
    expect(await remindedAt(old)).toBeInstanceOf(Date);
    expect(sndr.to(later.email)).toHaveLength(0);
    expect(await remindedAt(laterOne)).toBeNull();
    expect(sndr.to(forever.email)).toHaveLength(0);
  });

  it("does not mail a reminder for a subscription revoked after it was queued", async () => {
    const person = await student("revoked");
    const examId = await exam("STEP التجريبي");
    const id = await entitlement(person.id, examId, 12);

    await scheduler.runOnce();
    await e2eSql`UPDATE entitlements SET status = 'REVOKED' WHERE id = ${id}`;
    await relay.drain();

    expect(sndr.to(person.email)).toHaveLength(0);
  });
});

describe("retention", () => {
  it("deletes sessions and codes past their retention and keeps the rest", async () => {
    const person = await student("retention");
    const [old] = await e2eSql<{ id: string }[]>`
      INSERT INTO auth_sessions (user_id, token_hash, expires_at)
      VALUES (${person.id}, ${randomUUID()}, now() - interval '31 days') RETURNING id`;
    const [recent] = await e2eSql<{ id: string }[]>`
      INSERT INTO auth_sessions (user_id, token_hash, expires_at, revoked_at)
      VALUES (${person.id}, ${randomUUID()}, now() + interval '10 days', now() - interval '2 days')
      RETURNING id`;
    const [live] = await e2eSql<{ id: string }[]>`
      INSERT INTO auth_sessions (user_id, token_hash, expires_at)
      VALUES (${person.id}, ${randomUUID()}, now() + interval '10 days') RETURNING id`;
    await e2eSql`
      INSERT INTO one_time_codes (user_id, purpose, email, code_hash, expires_at, consumed_at, created_at)
      VALUES (${person.id}, 'EMAIL_VERIFICATION', ${person.email}, 'h', now() - interval '2 days',
              now() - interval '2 days', now() - interval '2 days')`;

    const report = await worker.get(RetentionSweeper).sweep();
    expect(report.sessions).toBeGreaterThanOrEqual(1);

    const ids = (
      await e2eSql<{ id: string }[]>`SELECT id FROM auth_sessions WHERE user_id = ${person.id}`
    ).map((s) => s.id);
    expect(ids).not.toContain(old?.id);
    expect(ids).toContain(recent?.id);
    expect(ids).toContain(live?.id);
    const [codes] = await e2eSql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM one_time_codes WHERE user_id = ${person.id}`;
    expect(codes?.count).toBe(0);
  });

  it("deletes handled outbox events after 30 days, never failed or pending ones", async () => {
    const aggregate = randomUUID();
    const insert = (status: "PUBLISHED" | "FAILED", ageDays: number) => {
      const publishedAt =
        status === "PUBLISHED" ? new Date(Date.now() - ageDays * 86_400_000) : null;
      return e2eSql<{ id: string }[]>`
        INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, status, published_at)
        VALUES ('retention-test', ${aggregate}, 'test.event', '{}'::jsonb, ${status}, ${publishedAt})
        RETURNING id`;
    };
    const [oldPublished] = await insert("PUBLISHED", 31);
    const [newPublished] = await insert("PUBLISHED", 5);
    const [failed] = await insert("FAILED", 90);

    await worker.get(RetentionSweeper).sweep();

    const left = (
      await e2eSql<{ id: string }[]>`SELECT id FROM outbox_events WHERE aggregate_id = ${aggregate}`
    ).map((r) => r.id);
    expect(left).not.toContain(oldPublished?.id);
    expect(left).toContain(newPublished?.id);
    expect(left).toContain(failed?.id);
    await e2eSql`DELETE FROM outbox_events WHERE aggregate_id = ${aggregate}`;
  });
});
