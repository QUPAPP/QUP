import { afterAll, describe, it } from "vitest";

import {
  expectRejected,
  firstRow,
  SqlState,
  type Tx,
  testSql,
  withRollback,
} from "./support/db.js";

afterAll(() => testSql.end());

type IdRow = { id: string };

async function buildPlan(tx: Tx): Promise<{ studentId: string; examId: string; planId: string }> {
  const student = firstRow(
    await tx<IdRow[]>`INSERT INTO users (display_name) VALUES ('test-buyer') RETURNING id`,
  );
  const exam = firstRow(
    await tx<IdRow[]>`
      INSERT INTO exams (code, slug, name_ar) VALUES ('TEST-B', 'test-b', 'اختبار') RETURNING id`,
  );
  const plan = firstRow(
    await tx<IdRow[]>`
      INSERT INTO plans (exam_id, code, name, price_minor, currency)
      VALUES (${exam.id}, 'TEST-PLAN', 'plan', 1000, 'SAR') RETURNING id`,
  );
  return { studentId: student.id, examId: exam.id, planId: plan.id };
}

// DOMAIN_MODEL.md §3 — "نفس payment event لا يمنح entitlement مرتين" / "webhook replay لا يكرر grant".
describe("billing replay protection", () => {
  it("rejects a second payment with the same idempotency key", () =>
    withRollback(async (tx) => {
      const { studentId, planId } = await buildPlan(tx);
      const pay = (db: Tx) => db`
        INSERT INTO payments (student_id, plan_id, provider, amount_minor, currency, idempotency_key)
        VALUES (${studentId}, ${planId}, 'test-provider', 1000, 'SAR', 'checkout-1')`;
      await pay(tx);

      await expectRejected(tx, SqlState.uniqueViolation, (sp) => pay(sp));
    }));

  it("grants at most one entitlement per payment reference", () =>
    withRollback(async (tx) => {
      const { studentId, examId, planId } = await buildPlan(tx);
      const grant = (db: Tx) => db`
        INSERT INTO entitlements (student_id, plan_id, exam_id, source, source_reference, starts_at)
        VALUES (${studentId}, ${planId}, ${examId}, 'PAYMENT', 'payment-123', now())`;
      await grant(tx);

      await expectRejected(tx, SqlState.uniqueViolation, (sp) => grant(sp));
    }));

  it("stores money as a non-negative amount in an ISO 4217 currency", () =>
    withRollback(async (tx) => {
      const { examId } = await buildPlan(tx);

      await expectRejected(
        tx,
        SqlState.checkViolation,
        (sp) => sp`
          INSERT INTO plans (exam_id, code, name, price_minor, currency)
          VALUES (${examId}, 'NEG', 'n', -1, 'SAR')`,
      );
      await expectRejected(
        tx,
        SqlState.checkViolation,
        (sp) => sp`
          INSERT INTO plans (exam_id, code, name, price_minor, currency)
          VALUES (${examId}, 'CUR', 'c', 100, 'riyal')`,
      );
    }));
});
