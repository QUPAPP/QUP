import { Inject, Injectable } from "@nestjs/common";
import { type Database, tables } from "@qup/db";
import { and, asc, desc, eq, sql } from "drizzle-orm";

import type { ActorContext } from "../../../common/actor.js";
import { AuditAction, writeAudit } from "../../../infrastructure/audit/audit-log.js";
import { DATABASE } from "../../../infrastructure/database/database.module.js";
import type { DbExecutor, DbTransaction } from "../../../infrastructure/database/executor.js";
import { PgErrorCode, pgErrorInfo } from "../../../infrastructure/database/postgres-errors.js";
import { PaymentNotFound, PlanCodeTaken } from "../domain/billing.errors.js";
import { nextEntitlementPeriod } from "../domain/entitlement-period.js";
import type { PlanStatus } from "../domain/plan-lifecycle.js";
import type {
  BillingStore,
  Entitlement,
  NewPaymentResult,
  Payment,
  Plan,
  RefundResult,
  SettleResult,
} from "../domain/ports.js";

const { plans, payments, entitlements, users } = tables;

const planColumns = {
  id: plans.id,
  examId: plans.examId,
  code: plans.code,
  name: plans.name,
  priceMinor: plans.priceMinor,
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

@Injectable()
export class DrizzleBillingStore implements BillingStore {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /* ------------------------------- Plans --------------------------------- */

  async findPlan(planId: string): Promise<Plan | null> {
    const [row] = await this.db.select(planColumns).from(plans).where(eq(plans.id, planId));
    return row ?? null;
  }

  listPlans(filter: { examId?: string; status?: PlanStatus }): Promise<Plan[]> {
    return this.db
      .select(planColumns)
      .from(plans)
      .where(
        and(
          filter.examId ? eq(plans.examId, filter.examId) : undefined,
          filter.status ? eq(plans.status, filter.status) : undefined,
        ),
      )
      .orderBy(asc(plans.priceMinor), asc(plans.code));
  }

  async createPlan(input: {
    examId: string;
    code: string;
    name: string;
    priceMinor: number;
    currency: string;
    durationDays: number | null;
  }): Promise<Plan> {
    try {
      const [plan] = await this.db.insert(plans).values(input).returning(planColumns);
      if (!plan) throw new Error("Plan insert returned no row.");
      return plan;
    } catch (error) {
      const info = pgErrorInfo(error);
      if (info?.code === PgErrorCode.uniqueViolation && info.constraint === "plans_code_unique") {
        throw new PlanCodeTaken();
      }
      throw error;
    }
  }

  async updateDraftPlan(
    planId: string,
    changes: { name?: string; priceMinor?: number; durationDays?: number | null },
  ): Promise<Plan | null> {
    const [plan] = await this.db
      .update(plans)
      .set(changes)
      // The status check is part of the write: a plan activated a moment ago is not edited.
      .where(and(eq(plans.id, planId), eq(plans.status, "DRAFT")))
      .returning(planColumns);
    return plan ?? null;
  }

  transitionPlan(
    planId: string,
    from: PlanStatus,
    to: PlanStatus,
    actor: ActorContext,
  ): Promise<Plan | null> {
    return this.db.transaction(async (tx) => {
      const [plan] = await tx
        .update(plans)
        .set({ status: to })
        .where(and(eq(plans.id, planId), eq(plans.status, from)))
        .returning(planColumns);
      if (!plan) return null;

      const action = AUDITED_PLAN_TRANSITIONS[to];
      if (action) {
        await writeAudit(tx, actor, {
          action,
          resourceType: "plan",
          resourceId: plan.id,
          metadata: {
            examId: plan.examId,
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

  settlePayment(
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

      const [plan] = await tx
        .select({ examId: plans.examId, durationDays: plans.durationDays })
        .from(plans)
        .where(eq(plans.id, payment.planId));
      if (!plan) throw new Error(`Plan ${payment.planId} of a payment is missing.`);

      await tx
        .update(payments)
        .set({
          status: "SUCCEEDED",
          paidAt: confirmation.paidAt,
          providerPayloadRedacted: { providerPaymentId: confirmation.providerPaymentId },
        })
        .where(eq(payments.id, payment.id));

      const entitlement = await grant(tx, actor, {
        studentId: payment.studentId,
        examId: plan.examId,
        planId: payment.planId,
        durationDays: plan.durationDays,
        source: "PAYMENT",
        // Unique per source: the database refuses a second grant for one payment.
        sourceReference: payment.id,
      });
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
          entitlementId: entitlement.id,
        },
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
          and(eq(entitlements.source, "PAYMENT"), eq(entitlements.sourceReference, payment.id)),
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
          revokedEntitlementId: revoked[0]?.id ?? null,
        },
      });
      return "REFUNDED";
    });
  }
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
