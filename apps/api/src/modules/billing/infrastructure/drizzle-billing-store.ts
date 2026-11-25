import { Inject, Injectable } from "@nestjs/common";
import { type Database, tables } from "@qup/db";
import { and, asc, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";

import type { ActorContext } from "../../../common/actor.js";
import { AuditAction, writeAudit } from "../../../infrastructure/audit/audit-log.js";
import { DATABASE } from "../../../infrastructure/database/database.module.js";
import type { DbExecutor, DbTransaction } from "../../../infrastructure/database/executor.js";
import { PgErrorCode, pgErrorInfo } from "../../../infrastructure/database/postgres-errors.js";
import { OutboxEventType, writeOutbox } from "../../../infrastructure/outbox/outbox.js";
import {
  PaymentNotFound,
  PlanCodeTaken,
  ProviderPaymentAlreadyUsed,
} from "../domain/billing.errors.js";
import { nextEntitlementPeriod } from "../domain/entitlement-period.js";
import type { PlanStatus } from "../domain/plan-lifecycle.js";
import { contentChanges, type PlanContent, type PurchasedTerms } from "../domain/plan-rules.js";
import type {
  BillingStore,
  EndingNotice,
  Entitlement,
  NewPaymentResult,
  Payment,
  PaymentFilter,
  PaymentRecord,
  Plan,
  PlanUpdate,
  RefundResult,
  RevenueSummary,
  SettleResult,
} from "../domain/ports.js";

const { plans, planExams, payments, entitlements, users } = tables;

/** SAR only in V1 (money.ts); the summary reports in it. */
const SUMMARY_CURRENCY = "SAR";

/**
 * The plan's exams, sorted, as text (a uuid[] would need its own parser).
 * Correlated on the outer `plans` row, so it also works under FOR UPDATE.
 */
const planExamIds = sql<string[]>`coalesce(
  (SELECT array_agg(pe.exam_id::text ORDER BY pe.exam_id) FROM plan_exams pe WHERE pe.plan_id = ${plans.id}),
  '{}'::text[])`;

const planColumns = {
  id: plans.id,
  code: plans.code,
  name: plans.name,
  description: plans.description,
  features: plans.features,
  highlighted: plans.highlighted,
  sortOrder: plans.sortOrder,
  examIds: planExamIds,
  priceMinor: plans.priceMinor,
  compareAtPriceMinor: plans.compareAtPriceMinor,
  currency: plans.currency,
  durationDays: plans.durationDays,
  status: plans.status,
  createdAt: plans.createdAt,
  updatedAt: plans.updatedAt,
};

const paymentColumns = {
  id: payments.id,
  studentId: payments.studentId,
  planId: payments.planId,
  provider: payments.provider,
  providerReference: payments.providerReference,
  amountMinor: payments.amountMinor,
  currency: payments.currency,
  status: payments.status,
  idempotencyKey: payments.idempotencyKey,
  checkoutUrl: payments.checkoutUrl,
  checkoutExpiresAt: payments.checkoutExpiresAt,
  terms: payments.terms,
  createdAt: payments.createdAt,
  paidAt: payments.paidAt,
};

const entitlementColumns = {
  id: entitlements.id,
  studentId: entitlements.studentId,
  examId: entitlements.examId,
  planId: entitlements.planId,
  source: entitlements.source,
  startsAt: entitlements.startsAt,
  endsAt: entitlements.endsAt,
  status: entitlements.status,
  createdAt: entitlements.createdAt,
};

const AUDITED_PLAN_TRANSITIONS: Partial<Record<PlanStatus, AuditAction>> = {
  ACTIVE: AuditAction.PlanActivated,
  RETIRED: AuditAction.PlanRetired,
};

/** Plan content columns as the table names them; `examIds` lives in plan_exams. */
function planRow(content: Partial<PlanContent>) {
  const { examIds: _examIds, features, ...scalars } = content;
  return { ...scalars, ...(features === undefined ? {} : { features: [...features] }) };
}

@Injectable()
export class DrizzleBillingStore implements BillingStore {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /* ------------------------------- Plans --------------------------------- */

  findPlan(planId: string): Promise<Plan | null> {
    return planById(this.db, planId);
  }

  listPlans(filter: { examId?: string; status?: PlanStatus }): Promise<Plan[]> {
    return this.db
      .select(planColumns)
      .from(plans)
      .where(
        and(
          filter.examId
            ? sql`EXISTS (SELECT 1 FROM plan_exams pe WHERE pe.plan_id = ${plans.id} AND pe.exam_id = ${filter.examId})`
            : undefined,
          filter.status ? eq(plans.status, filter.status) : undefined,
        ),
      )
      .orderBy(asc(plans.sortOrder), asc(plans.priceMinor), asc(plans.code));
  }

  async createPlan(input: PlanContent & { code: string; currency: string }): Promise<Plan> {
    try {
      return await this.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(plans)
          .values({
            code: input.code,
            name: input.name,
            description: input.description,
            features: [...input.features],
            highlighted: input.highlighted,
            sortOrder: input.sortOrder,
            priceMinor: input.priceMinor,
            compareAtPriceMinor: input.compareAtPriceMinor,
            currency: input.currency,
            durationDays: input.durationDays,
          })
          .returning({ id: plans.id });
        if (!created) throw new Error("Plan insert returned no row.");
        await replaceExams(tx, created.id, input.examIds);
        const plan = await planById(tx, created.id);
        if (!plan) throw new Error("Plan vanished inside its own transaction.");
        return plan;
      });
    } catch (error) {
      const info = pgErrorInfo(error);
      if (info?.code === PgErrorCode.uniqueViolation && info.constraint === "plans_code_unique") {
        throw new PlanCodeTaken();
      }
      throw error;
    }
  }

  updatePlan(planId: string, update: PlanUpdate, actor: ActorContext): Promise<Plan | null> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select(planColumns)
        .from(plans)
        .where(eq(plans.id, planId))
        .for("update");
      if (!current) return null;

      // Decided against the locked row: a concurrent activation cannot slip in between.
      const changes = update(current);
      const diff = contentChanges(current, changes);
      if (Object.keys(diff).length === 0) return current;

      const row = planRow(changes);
      if (Object.keys(row).length > 0) await tx.update(plans).set(row).where(eq(plans.id, planId));
      if (changes.examIds !== undefined) await replaceExams(tx, planId, changes.examIds);

      await writeAudit(tx, actor, {
        action: AuditAction.PlanUpdated,
        resourceType: "plan",
        resourceId: planId,
        metadata: { code: current.code, status: current.status, ...diff },
      });
      return planById(tx, planId);
    });
  }

  transitionPlan(
    planId: string,
    from: PlanStatus,
    to: PlanStatus,
    actor: ActorContext,
  ): Promise<Plan | null> {
    return this.db.transaction(async (tx) => {
      const [moved] = await tx
        .update(plans)
        .set({ status: to })
        .where(and(eq(plans.id, planId), eq(plans.status, from)))
        .returning({ id: plans.id });
      if (!moved) return null;
      const plan = await planById(tx, moved.id);
      if (!plan) throw new Error("Plan vanished inside its own transaction.");

      const action = AUDITED_PLAN_TRANSITIONS[to];
      if (action) {
        await writeAudit(tx, actor, {
          action,
          resourceType: "plan",
          resourceId: plan.id,
          metadata: {
            examIds: plan.examIds.join(","),
            code: plan.code,
            priceMinor: plan.priceMinor,
            currency: plan.currency,
            durationDays: plan.durationDays,
          },
        });
      }
      return plan;
    });
  }

  /* ---------------------------- Entitlements ------------------------------ */

  async studentExists(studentId: string): Promise<boolean> {
    const [row] = await this.db.select({ id: users.id }).from(users).where(eq(users.id, studentId));
    return row !== undefined;
  }

  entitlementsFor(studentId: string, examId?: string): Promise<Entitlement[]> {
    return entitlementsOf(this.db, studentId, examId);
  }

  async entitlementSnapshot(
    studentId: string,
    examId: string,
  ): Promise<{ asOf: Date; entitlements: Entitlement[] }> {
    // Rows first, clock second: the clock is then never behind a row it is compared with.
    const rows = await entitlementsOf(this.db, studentId, examId);
    return { asOf: await databaseTime(this.db), entitlements: rows };
  }

  grantByAdmin(
    input: { studentId: string; examId: string; durationDays: number | null },
    actor: ActorContext,
  ): Promise<Entitlement> {
    return this.db.transaction((tx) =>
      grant(tx, actor, {
        studentId: input.studentId,
        examId: input.examId,
        planId: null,
        durationDays: input.durationDays,
        source: "ADMIN",
        sourceReference: null,
      }),
    );
  }

  async queueEndingReminders(input: {
    endingBefore: Date;
    limit: number;
  }): Promise<{ claimed: number; queued: number }> {
    return this.db.transaction(async (tx) => {
      // Database time, like every other access check here (entitlementSnapshot).
      const due = await tx.execute<{ id: string; student_id: string; renewed: boolean }>(sql`
        SELECT e.id, e.student_id, EXISTS (
          SELECT 1 FROM ${entitlements} later
          WHERE later.student_id = e.student_id AND later.exam_id = e.exam_id
            AND later.id <> e.id AND later.status = 'ACTIVE'
            AND (later.ends_at IS NULL OR later.ends_at > e.ends_at)
        ) AS renewed
        FROM ${entitlements} e
        WHERE e.status = 'ACTIVE' AND e.ends_at IS NOT NULL
          AND e.ending_reminder_queued_at IS NULL
          AND e.ends_at > now() AND e.ends_at <= ${input.endingBefore.toISOString()}::timestamptz
        ORDER BY e.ends_at
        LIMIT ${input.limit}
        FOR UPDATE OF e SKIP LOCKED`);
      const rows = [...due];
      if (rows.length === 0) return { claimed: 0, queued: 0 };

      await tx
        .update(entitlements)
        .set({ endingReminderQueuedAt: sql`now()` })
        .where(
          inArray(
            entitlements.id,
            rows.map((row) => row.id),
          ),
        );
      let queued = 0;
      for (const row of rows) {
        if (row.renewed) continue;
        await writeOutbox(tx, {
          type: OutboxEventType.EmailRequested,
          aggregateType: "entitlement",
          aggregateId: row.id,
          payload: { kind: "SUBSCRIPTION_ENDING", userId: row.student_id, entitlementId: row.id },
        });
        queued += 1;
      }
      return { claimed: rows.length, queued };
    });
  }

  async endingNotice(entitlementId: string): Promise<EndingNotice | null> {
    const result = await this.db.execute<{
      student_id: string;
      exam_id: string;
      ends_at: Date | string | null;
      still_ending: boolean;
    }>(sql`
      SELECT e.student_id, e.exam_id, e.ends_at,
        (e.status = 'ACTIVE' AND e.ends_at IS NOT NULL AND e.ends_at > now() AND NOT EXISTS (
          SELECT 1 FROM ${entitlements} later
          WHERE later.student_id = e.student_id AND later.exam_id = e.exam_id
            AND later.id <> e.id AND later.status = 'ACTIVE'
            AND (later.ends_at IS NULL OR later.ends_at > e.ends_at)
        )) AS still_ending
      FROM ${entitlements} e WHERE e.id = ${entitlementId}`);
    const [row] = result;
    if (!row) return null;
    return {
      studentId: row.student_id,
      examId: row.exam_id,
      endsAt: row.ends_at === null ? null : new Date(row.ends_at),
      stillEnding: row.still_ending,
    };
  }

  revokeEntitlement(entitlementId: string, actor: ActorContext): Promise<Entitlement | null> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select(entitlementColumns)
        .from(entitlements)
        .where(eq(entitlements.id, entitlementId))
        .for("update");
      if (!current) return null;
      if (current.status === "REVOKED") return current;

      const [revoked] = await tx
        .update(entitlements)
        .set({ status: "REVOKED" })
        .where(eq(entitlements.id, entitlementId))
        .returning(entitlementColumns);
      if (!revoked) throw new Error("Entitlement update returned no row.");
      await writeAudit(tx, actor, {
        action: AuditAction.EntitlementRevoked,
        resourceType: "entitlement",
        resourceId: revoked.id,
        metadata: { studentId: revoked.studentId, examId: revoked.examId, reason: "ADMIN" },
      });
      return revoked;
    });
  }

  /* ------------------------------ Payments -------------------------------- */

  async findPayment(paymentId: string): Promise<Payment | null> {
    const [row] = await this.db
      .select(paymentColumns)
      .from(payments)
      .where(eq(payments.id, paymentId));
    return row ?? null;
  }

  async findPaymentByIdempotencyKey(key: string): Promise<Payment | null> {
    const [row] = await this.db
      .select(paymentColumns)
      .from(payments)
      .where(eq(payments.idempotencyKey, key));
    return row ?? null;
  }

  async findPaymentByProviderReference(
    provider: string,
    reference: string,
  ): Promise<Payment | null> {
    const [row] = await this.db
      .select(paymentColumns)
      .from(payments)
      .where(and(eq(payments.provider, provider), eq(payments.providerReference, reference)));
    return row ?? null;
  }

  async findPendingPayment(studentId: string, planId: string): Promise<Payment | null> {
    const [row] = await this.db
      .select(paymentColumns)
      .from(payments)
      .where(
        and(
          eq(payments.studentId, studentId),
          eq(payments.planId, planId),
          eq(payments.status, "PENDING"),
        ),
      );
    return row ?? null;
  }

  async createPendingPayment(input: {
    studentId: string;
    planId: string;
    provider: string;
    amountMinor: number;
    currency: string;
    idempotencyKey: string;
    terms: PurchasedTerms;
  }): Promise<NewPaymentResult> {
    try {
      const [payment] = await this.db.insert(payments).values(input).returning(paymentColumns);
      if (!payment) throw new Error("Payment insert returned no row.");
      return { kind: "CREATED", payment };
    } catch (error) {
      const info = pgErrorInfo(error);
      if (info?.code !== PgErrorCode.uniqueViolation) throw error;
      if (info.constraint === "payments_idempotency_key_unique") {
        const existing = await this.findPaymentByIdempotencyKey(input.idempotencyKey);
        if (existing) return { kind: "KEY_EXISTS", payment: existing };
      }
      if (info.constraint === "payments_one_pending") return { kind: "PENDING_EXISTS" };
      throw error;
    }
  }

  paymentsOf(studentId: string, limit: number): Promise<Payment[]> {
    return this.db
      .select(paymentColumns)
      .from(payments)
      .where(eq(payments.studentId, studentId))
      .orderBy(desc(payments.createdAt), desc(payments.id))
      .limit(limit);
  }

  listPayments(filter: PaymentFilter): Promise<PaymentRecord[]> {
    const { before } = filter;
    return this.db
      .select({
        ...paymentColumns,
        planName: plans.name,
        student: {
          id: users.id,
          email: users.email,
          phone: users.phone,
          displayName: users.displayName,
        },
        providerPaymentId: sql<
          string | null
        >`${payments.providerPayloadRedacted} ->> 'providerPaymentId'`,
      })
      .from(payments)
      .innerJoin(plans, eq(plans.id, payments.planId))
      .innerJoin(users, eq(users.id, payments.studentId))
      .where(
        and(
          filter.status ? eq(payments.status, filter.status) : undefined,
          // Keyset, not offset: a page stays stable while new payments arrive.
          before
            ? sql`(${payments.createdAt}, ${payments.id}) < (${before.createdAt.toISOString()}::timestamptz, ${before.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(desc(payments.createdAt), desc(payments.id))
      .limit(filter.limit);
  }

  async payingStudentsAmong(studentIds: readonly string[], since: Date): Promise<number> {
    if (studentIds.length === 0) return 0;
    const [row] = await this.db
      .select({ n: sql<number>`count(DISTINCT ${payments.studentId})::int` })
      .from(payments)
      .where(
        and(
          inArray(payments.studentId, [...studentIds]),
          inArray(payments.status, ["SUCCEEDED", "REFUNDED"]),
          gte(payments.paidAt, since),
        ),
      );
    return row?.n ?? 0;
  }

  async revenueSummary(since: Date): Promise<RevenueSummary> {
    const recent = and(gte(payments.createdAt, since), eq(payments.currency, SUMMARY_CURRENCY));
    const [row] = await this.db
      .select({
        succeededCount: sql<number>`count(*) FILTER (WHERE ${payments.status} = 'SUCCEEDED')::int`,
        succeededMinor: sql<number>`coalesce(sum(${payments.amountMinor}) FILTER (WHERE ${payments.status} = 'SUCCEEDED'), 0)::bigint`,
        refundedCount: sql<number>`count(*) FILTER (WHERE ${payments.status} = 'REFUNDED')::int`,
        refundedMinor: sql<number>`coalesce(sum(${payments.amountMinor}) FILTER (WHERE ${payments.status} = 'REFUNDED'), 0)::bigint`,
        abandoned: sql<number>`count(*) FILTER (WHERE ${payments.status} IN ('PENDING', 'FAILED', 'CANCELLED'))::int`,
      })
      .from(payments)
      .where(recent);
    return {
      since,
      succeeded: { count: row?.succeededCount ?? 0, amountMinor: Number(row?.succeededMinor ?? 0) },
      refunded: { count: row?.refundedCount ?? 0, amountMinor: Number(row?.refundedMinor ?? 0) },
      abandoned: row?.abandoned ?? 0,
      currency: SUMMARY_CURRENCY,
    };
  }

  async attachCheckout(
    paymentId: string,
    checkout: { reference: string; checkoutUrl: string; expiresAt: Date },
  ): Promise<boolean> {
    const updated = await this.db
      .update(payments)
      .set({
        providerReference: checkout.reference,
        checkoutUrl: checkout.checkoutUrl,
        checkoutExpiresAt: checkout.expiresAt,
      })
      .where(and(eq(payments.id, paymentId), eq(payments.status, "PENDING")))
      .returning({ id: payments.id });
    return updated.length > 0;
  }

  async closePendingPayment(paymentId: string, status: "FAILED" | "CANCELLED"): Promise<void> {
    await this.db
      .update(payments)
      .set({ status })
      .where(and(eq(payments.id, paymentId), eq(payments.status, "PENDING")));
  }

  async settlePayment(
    paymentId: string,
    confirmation: { providerPaymentId: string; paidAt: Date },
    actor: ActorContext,
  ): Promise<SettleResult> {
    try {
      return await this.settleOnce(paymentId, confirmation, actor);
    } catch (error) {
      // payments_provider_payment_unique (0023): that money already bought another payment.
      const info = pgErrorInfo(error);
      if (
        info?.code === PgErrorCode.uniqueViolation &&
        info.constraint === "payments_provider_payment_unique"
      ) {
        throw new ProviderPaymentAlreadyUsed();
      }
      throw error;
    }
  }

  private settleOnce(
    paymentId: string,
    confirmation: { providerPaymentId: string; paidAt: Date },
    actor: ActorContext,
  ): Promise<SettleResult> {
    return this.db.transaction(async (tx) => {
      const payment = await lockPayment(tx, paymentId);
      if (payment.status === "SUCCEEDED") return "ALREADY_SETTLED";
      if (payment.status === "REFUNDED") return "REFUNDED_EARLIER";
      // PENDING is the normal case. FAILED and CANCELLED settle too: the
      // provider has the money, so the student gets what they paid for even
      // if we had given up on the checkout.

      const terms = payment.terms ?? (await termsFromPlan(tx, payment.planId));

      await tx
        .update(payments)
        .set({
          status: "SUCCEEDED",
          paidAt: confirmation.paidAt,
          providerPayloadRedacted: { providerPaymentId: confirmation.providerPaymentId },
        })
        .where(eq(payments.id, payment.id));

      // In the terms' (sorted) order: concurrent grants lock exams in one order.
      const granted: Entitlement[] = [];
      for (const examId of terms.examIds) {
        granted.push(
          await grant(tx, actor, {
            studentId: payment.studentId,
            examId,
            planId: payment.planId,
            durationDays: terms.durationDays,
            source: "PAYMENT",
            // Unique per (source, reference, exam): a replay cannot grant twice.
            sourceReference: payment.id,
          }),
        );
      }
      await writeAudit(tx, actor, {
        action: AuditAction.PaymentSettled,
        resourceType: "payment",
        resourceId: payment.id,
        metadata: {
          studentId: payment.studentId,
          planId: payment.planId,
          amountMinor: payment.amountMinor,
          currency: payment.currency,
          provider: payment.provider,
          entitlementIds: granted.map((e) => e.id).join(","),
        },
      });
      // The receipt is owed from the moment the payment committed: queued with it, sent by the worker.
      await writeOutbox(tx, {
        type: OutboxEventType.EmailRequested,
        aggregateType: "payment",
        aggregateId: payment.id,
        payload: { kind: "PAYMENT_RECEIPT", userId: payment.studentId, paymentId: payment.id },
      });
      return "SETTLED";
    });
  }

  refundPayment(
    paymentId: string,
    confirmation: { providerPaymentId: string },
    actor: ActorContext,
  ): Promise<RefundResult> {
    return this.db.transaction(async (tx) => {
      const payment = await lockPayment(tx, paymentId);
      if (payment.status === "REFUNDED") return "ALREADY_REFUNDED";
      if (payment.status !== "SUCCEEDED") return "NEVER_PAID";

      await tx.update(payments).set({ status: "REFUNDED" }).where(eq(payments.id, payment.id));
      const revoked = await tx
        .update(entitlements)
        .set({ status: "REVOKED" })
        .where(
          and(
            eq(entitlements.source, "PAYMENT"),
            eq(entitlements.sourceReference, payment.id),
            ne(entitlements.status, "REVOKED"),
          ),
        )
        .returning({ id: entitlements.id });

      await writeAudit(tx, actor, {
        action: AuditAction.PaymentRefunded,
        resourceType: "payment",
        resourceId: payment.id,
        metadata: {
          studentId: payment.studentId,
          provider: payment.provider,
          providerPaymentId: confirmation.providerPaymentId,
          revokedEntitlementIds: revoked.map((e) => e.id).join(","),
        },
      });
      await writeOutbox(tx, {
        type: OutboxEventType.EmailRequested,
        aggregateType: "payment",
        aggregateId: payment.id,
        payload: { kind: "PAYMENT_REFUNDED", userId: payment.studentId, paymentId: payment.id },
      });
      return "REFUNDED";
    });
  }
}

async function planById(executor: DbExecutor, planId: string): Promise<Plan | null> {
  const [row] = await executor.select(planColumns).from(plans).where(eq(plans.id, planId));
  return row ?? null;
}

async function replaceExams(
  tx: DbTransaction,
  planId: string,
  examIds: readonly string[],
): Promise<void> {
  await tx.delete(planExams).where(eq(planExams.planId, planId));
  if (examIds.length > 0) {
    await tx.insert(planExams).values(examIds.map((examId) => ({ planId, examId })));
  }
}

/** Payments opened before 0018 recorded no terms; their plan could not change since. */
async function termsFromPlan(tx: DbTransaction, planId: string): Promise<PurchasedTerms> {
  const plan = await planById(tx, planId);
  if (!plan) throw new Error(`Plan ${planId} of a payment is missing.`);
  return { planName: plan.name, durationDays: plan.durationDays, examIds: plan.examIds };
}

/** The one clock entitlement periods are written and read against. */
async function databaseTime(executor: DbExecutor): Promise<Date> {
  const [clock] = await executor.execute<{ now: string }>(sql`SELECT now() AS now`);
  if (!clock) throw new Error("The database did not report its time.");
  return new Date(clock.now);
}

async function lockPayment(tx: DbTransaction, paymentId: string) {
  const [payment] = await tx
    .select(paymentColumns)
    .from(payments)
    .where(eq(payments.id, paymentId))
    .for("update");
  if (!payment) throw new PaymentNotFound();
  return payment;
}

function entitlementsOf(
  executor: DbExecutor,
  studentId: string,
  examId?: string,
): Promise<Entitlement[]> {
  return executor
    .select(entitlementColumns)
    .from(entitlements)
    .where(
      and(
        eq(entitlements.studentId, studentId),
        examId ? eq(entitlements.examId, examId) : undefined,
      ),
    )
    .orderBy(desc(entitlements.startsAt));
}

/**
 * Inserts an entitlement and its audit entry. Grants for one student and exam
 * are serialized by an advisory lock, so two grants landing together queue
 * one after the other instead of both starting "now" and overlapping.
 */
async function grant(
  tx: DbTransaction,
  actor: ActorContext,
  input: {
    studentId: string;
    examId: string;
    planId: string | null;
    durationDays: number | null;
    source: "PAYMENT" | "ADMIN";
    sourceReference: string | null;
  },
): Promise<Entitlement> {
  const lockKey = `entitlement:${input.studentId}:${input.examId}`;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);

  const period = nextEntitlementPeriod({
    now: await databaseTime(tx),
    durationDays: input.durationDays,
    existing: await entitlementsOf(tx, input.studentId, input.examId),
  });

  const [entitlement] = await tx
    .insert(entitlements)
    .values({
      studentId: input.studentId,
      examId: input.examId,
      planId: input.planId,
      source: input.source,
      sourceReference: input.sourceReference,
      startsAt: period.startsAt,
      endsAt: period.endsAt,
    })
    .returning(entitlementColumns);
  if (!entitlement) throw new Error("Entitlement insert returned no row.");

  await writeAudit(tx, actor, {
    action: AuditAction.EntitlementGranted,
    resourceType: "entitlement",
    resourceId: entitlement.id,
    metadata: {
      studentId: input.studentId,
      examId: input.examId,
      source: input.source,
      durationDays: input.durationDays,
    },
  });
  return entitlement;
}
