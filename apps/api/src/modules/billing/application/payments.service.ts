import { Inject, Injectable } from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import type { ActorContext } from "../../../common/actor.js";
import { APP_CONFIG, type AppConfig } from "../../../config/app-config.js";
import { CATALOG_LOOKUP, type CatalogLookup } from "../../catalog/catalog.contract.js";
import type { PaymentReceipt, PaymentReceipts } from "../billing.contract.js";
import {
  AlreadyEntitled,
  CheckoutSuperseded,
  PaymentIdempotencyKeyReused,
  PaymentNotFound,
  PaymentProviderUnavailable,
  PaymentsNotConfigured,
  PlanNotAvailable,
  ProviderPaymentDoesNotMatch,
  ProviderPaymentNotPaid,
  WebhookProviderUnknown,
} from "../domain/billing.errors.js";
import { accessSummary } from "../domain/entitlement-period.js";
import { checkoutStillMatches, purchasedTerms, wouldAddAccess } from "../domain/plan-rules.js";
import {
  BILLING_STORE,
  type BillingStore,
  PAYMENT_PROVIDER,
  type Payment,
  type PaymentProvider,
  type Plan,
  type ProviderEvent,
  ProviderRequestFailed,
} from "../domain/ports.js";
import { refundableUntil } from "../domain/refund-policy.js";

const MS_PER_MINUTE = 60_000;
/** A checkout about to expire is not handed out again: the payer needs time to pay. */
const MIN_REMAINING_CHECKOUT_MS = 5 * MS_PER_MINUTE;
/** More than any student makes; the history page shows them all. */
const STUDENT_HISTORY_LIMIT = 50;

export interface CheckoutResult {
  payment: Payment;
  /** False when an existing checkout was returned instead of opening a new one. */
  created: boolean;
}

/** What a webhook delivery led to — for the log line and for tests. */
export type WebhookOutcome =
  | "NOT_A_PAYMENT_EVENT"
  | "UNKNOWN_PAYMENT"
  | "PAYMENT_MISMATCH"
  | "AMOUNT_MISMATCH"
  | "NO_CHANGE"
  | "SETTLED"
  | "ALREADY_SETTLED"
  | "REFUNDED_EARLIER"
  | "REFUNDED"
  | "ALREADY_REFUNDED"
  | "NEVER_PAID"
  | "PARTIAL_REFUND_NOTED";

/**
 * Buying a plan (WORKFLOWS.md §10, SECURITY.md "Payments"):
 *
 *   checkout → provider page → signed webhook → confirm with the provider
 *   → idempotent payment transition + entitlement grant, one transaction
 *
 * The browser coming back from the provider proves nothing; only the
 * provider's own answer about the payment moves it to SUCCEEDED.
 */
@Injectable()
export class PaymentsService implements PaymentReceipts {
  constructor(
    @Inject(BILLING_STORE) private readonly store: BillingStore,
    @Inject(CATALOG_LOOKUP) private readonly catalog: CatalogLookup,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider | null,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @InjectPinoLogger(PaymentsService.name) private readonly logger: PinoLogger,
  ) {}

  async checkout(
    studentId: string,
    planId: string,
    idempotencyKey: string,
  ): Promise<CheckoutResult> {
    const provider = this.requireProvider();

    // A retry of an earlier request: same answer, no second checkout.
    const earlier = await this.store.findPaymentByIdempotencyKey(idempotencyKey);
    if (earlier) return { payment: sameRequest(earlier, studentId, planId), created: false };

    const plan = await this.sellablePlan(planId);
    const coveredAccess: boolean[] = [];
    for (const examId of plan.examIds) {
      const { asOf, entitlements } = await this.store.entitlementSnapshot(studentId, examId);
      coveredAccess.push(accessSummary(entitlements, asOf).hasAccess);
    }
    if (!wouldAddAccess(coveredAccess)) throw new AlreadyEntitled();

    const open = await this.store.findPendingPayment(studentId, planId);
    if (open) {
      if (isUsable(open, new Date()) && checkoutStillMatches(open, plan)) {
        return { payment: open, created: false };
      }
      // Expired, never got its link, or opened at a price the plan no longer
      // has: close it so a fresh one at today's price can be opened. If the
      // student still pays the old link, they get what that link sold.
      await this.store.closePendingPayment(open.id, "CANCELLED");
    }

    const created = await this.store.createPendingPayment({
      studentId,
      planId,
      provider: provider.name,
      amountMinor: plan.priceMinor,
      currency: plan.currency,
      idempotencyKey,
      terms: purchasedTerms(plan),
    });
    if (created.kind === "KEY_EXISTS") {
      return { payment: sameRequest(created.payment, studentId, planId), created: false };
    }
    if (created.kind === "PENDING_EXISTS") throw new CheckoutSuperseded();

    return { payment: await this.openCheckout(provider, created.payment, plan), created: true };
  }

  async get(studentId: string, paymentId: string): Promise<Payment> {
    const payment = await this.store.findPayment(paymentId);
    if (payment?.studentId !== studentId) throw new PaymentNotFound();
    return payment;
  }

  /** What a payment bought and became of, for the receipt email (billing.contract.ts). */
  async receiptFor(paymentId: string): Promise<PaymentReceipt | null> {
    const payment = await this.store.findPayment(paymentId);
    if (!payment) return null;
    // Payments older than `terms` are named by their plan, which could not change before then.
    const planName =
      payment.terms?.planName ?? (await this.store.findPlan(payment.planId))?.name ?? "";
    return {
      studentId: payment.studentId,
      planName,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      status: payment.status,
      paidAt: payment.paidAt,
      refundableUntil: refundableUntil(payment.paidAt),
    };
  }

  /** The student's own payments, newest first. A student makes a handful; no paging. */
  history(studentId: string): Promise<Payment[]> {
    return this.store.paymentsOf(studentId, STUDENT_HISTORY_LIMIT);
  }

  /**
   * Handles one webhook delivery. Returning normally acknowledges it; throwing
   * makes the provider retry later (used when the provider cannot be asked).
   */
  async handleWebhook(
    providerName: string,
    rawBody: Buffer,
    headers: Record<string, string | undefined>,
    actor: ActorContext,
  ): Promise<WebhookOutcome> {
    const provider = this.requireProvider();
    if (providerName !== provider.name) throw new WebhookProviderUnknown();

    const event = provider.verifyWebhook(rawBody, headers);
    const outcome = event ? await this.applyEvent(provider, event, actor) : "NOT_A_PAYMENT_EVENT";
    this.logger.info(
      { provider: provider.name, eventType: event?.type ?? null, outcome },
      "Payment webhook handled",
    );
    return outcome;
  }

  /**
   * An admin links one of our payments to the provider's payment by hand (RUNBOOK.md §6), for
   * when the webhook never came: a student paid and has no access. The provider is asked, as for
   * a webhook, and only its answer counts — the amount and currency must match, and one provider
   * payment settles at most one of ours (0023). Settling or refunding is audited with the admin.
   */
  async reconcile(
    paymentId: string,
    providerPaymentId: string,
    actor: ActorContext,
  ): Promise<{ outcome: WebhookOutcome; payment: Payment }> {
    const provider = this.requireProvider();
    const payment = await this.store.findPayment(paymentId);
    if (!payment) throw new PaymentNotFound();

    let confirmed: Awaited<ReturnType<PaymentProvider["fetchPayment"]>>;
    try {
      confirmed = await provider.fetchPayment(providerPaymentId);
    } catch (error) {
      throw this.unavailable(error, payment.id);
    }

    let outcome: WebhookOutcome;
    switch (confirmed.status) {
      case "PAID":
        if (
          confirmed.amountMinor !== payment.amountMinor ||
          confirmed.currency !== payment.currency
        ) {
          throw new ProviderPaymentDoesNotMatch({
            expectedMinor: payment.amountMinor,
            paidMinor: confirmed.amountMinor,
            currency: confirmed.currency,
          });
        }
        outcome = await this.store.settlePayment(
          payment.id,
          { providerPaymentId: confirmed.id, paidAt: confirmed.paidAt ?? new Date() },
          actor,
        );
        break;
      case "REFUNDED":
        outcome = await this.store.refundPayment(
          payment.id,
          { providerPaymentId: confirmed.id },
          actor,
        );
        break;
      case "PARTIALLY_REFUNDED":
      case "OTHER":
        throw new ProviderPaymentNotPaid();
    }
    this.logger.info(
      { paymentId: payment.id, outcome, adminId: actor.userId },
      "Payment reconciled by an admin",
    );
    return { outcome, payment: (await this.store.findPayment(payment.id)) ?? payment };
  }

  private async applyEvent(
    provider: PaymentProvider,
    event: ProviderEvent,
    actor: ActorContext,
  ): Promise<WebhookOutcome> {
    const payment = event.checkoutReference
      ? await this.store.findPaymentByProviderReference(provider.name, event.checkoutReference)
      : null;
    // Not ours — e.g. a link created by hand in the provider's dashboard.
    if (!payment) return "UNKNOWN_PAYMENT";
    if (event.paymentId !== null && event.paymentId !== payment.id) {
      this.logger.error(
        { paymentId: payment.id, eventType: event.type },
        "Webhook names a different payment than its checkout",
      );
      return "PAYMENT_MISMATCH";
    }

    // The event says something happened; the provider's API says what is true
    // now. Acting on the latter makes stale and replayed events harmless.
    let confirmed: Awaited<ReturnType<PaymentProvider["fetchPayment"]>>;
    try {
      confirmed = await provider.fetchPayment(event.providerPaymentId);
    } catch (error) {
      throw this.unavailable(error, payment.id);
    }

    switch (confirmed.status) {
      case "PAID": {
        // SECURITY.md: "server validates amount/currency/plan".
        if (
          confirmed.amountMinor !== payment.amountMinor ||
          confirmed.currency !== payment.currency
        ) {
          this.logger.error(
            {
              paymentId: payment.id,
              expectedMinor: payment.amountMinor,
              paidMinor: confirmed.amountMinor,
              expectedCurrency: payment.currency,
              paidCurrency: confirmed.currency,
            },
            "Paid amount differs from the payment; entitlement withheld",
          );
          return "AMOUNT_MISMATCH";
        }
        return this.store.settlePayment(
          payment.id,
          { providerPaymentId: confirmed.id, paidAt: confirmed.paidAt ?? new Date() },
          actor,
        );
      }
      case "REFUNDED":
        return this.store.refundPayment(payment.id, { providerPaymentId: confirmed.id }, actor);
      case "PARTIALLY_REFUNDED":
        // OPEN_QUESTIONS.md #5a: no rule yet for partial refunds; access is kept.
        this.logger.warn({ paymentId: payment.id }, "Payment partially refunded at the provider");
        return "PARTIAL_REFUND_NOTED";
      case "OTHER":
        // A failed or cancelled attempt: the checkout stays open until it expires.
        return "NO_CHANGE";
    }
  }

  private async openCheckout(
    provider: PaymentProvider,
    payment: Payment,
    plan: Plan,
  ): Promise<Payment> {
    const expiresAt = new Date(
      Date.now() + this.config.payments.checkoutTtlMinutes * MS_PER_MINUTE,
    );
    let session: Awaited<ReturnType<PaymentProvider["createCheckout"]>>;
    try {
      session = await provider.createCheckout({
        paymentId: payment.id,
        title: plan.name,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        expiresAt,
      });
    } catch (error) {
      await this.store.closePendingPayment(payment.id, "FAILED");
      throw this.unavailable(error, payment.id);
    }

    if (session.amountMinor !== payment.amountMinor || session.currency !== payment.currency) {
      await this.store.closePendingPayment(payment.id, "FAILED");
      this.logger.error(
        {
          paymentId: payment.id,
          expectedMinor: payment.amountMinor,
          quotedMinor: session.amountMinor,
        },
        "Provider checkout quotes a different amount than the plan; checkout refused",
      );
      throw new PaymentProviderUnavailable();
    }

    const attached = await this.store.attachCheckout(payment.id, {
      reference: session.reference,
      checkoutUrl: session.checkoutUrl,
      expiresAt,
    });
    if (!attached) throw new CheckoutSuperseded();
    return {
      ...payment,
      providerReference: session.reference,
      checkoutUrl: session.checkoutUrl,
      checkoutExpiresAt: expiresAt,
    };
  }

  private async sellablePlan(planId: string): Promise<Plan> {
    const plan = await this.store.findPlan(planId);
    if (plan?.status !== "ACTIVE" || plan.examIds.length === 0) throw new PlanNotAvailable();
    // A bundle sells only while every exam in it is offered: it must deliver all it promises.
    for (const examId of plan.examIds) {
      if ((await this.catalog.examStatus(examId)) !== "ACTIVE") throw new PlanNotAvailable();
    }
    return plan;
  }

  private requireProvider(): PaymentProvider {
    if (!this.provider) throw new PaymentsNotConfigured();
    return this.provider;
  }

  /** Logs what failed (never credentials) and returns the client-safe error. */
  private unavailable(error: unknown, paymentId: string): PaymentProviderUnavailable {
    if (!(error instanceof ProviderRequestFailed)) throw error;
    this.logger.error(
      {
        paymentId,
        operation: error.operation,
        providerStatus: error.status,
        providerCode: error.providerCode,
      },
      "Payment provider request failed",
    );
    return new PaymentProviderUnavailable();
  }
}

/** The key must mean the same request it meant the first time. */
function sameRequest(payment: Payment, studentId: string, planId: string): Payment {
  if (payment.studentId !== studentId || payment.planId !== planId) {
    throw new PaymentIdempotencyKeyReused();
  }
  return payment;
}

function isUsable(payment: Payment, now: Date): boolean {
  return (
    payment.checkoutUrl !== null &&
    payment.checkoutExpiresAt !== null &&
    payment.checkoutExpiresAt.getTime() - now.getTime() > MIN_REMAINING_CHECKOUT_MS
  );
}
