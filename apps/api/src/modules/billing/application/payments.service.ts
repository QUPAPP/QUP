import { Inject, Injectable } from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import type { ActorContext } from "../../../common/actor.js";
import { APP_CONFIG, type AppConfig } from "../../../config/app-config.js";
import { CATALOG_LOOKUP, type CatalogLookup } from "../../catalog/catalog.contract.js";
import {
  AlreadyEntitled,
  CheckoutSuperseded,
  PaymentIdempotencyKeyReused,
  PaymentNotFound,
  PaymentProviderUnavailable,
  PaymentsNotConfigured,
  PlanNotAvailable,
  WebhookProviderUnknown,
} from "../domain/billing.errors.js";
import { accessSummary } from "../domain/entitlement-period.js";
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

const MS_PER_MINUTE = 60_000;
/** A checkout about to expire is not handed out again: the payer needs time to pay. */
const MIN_REMAINING_CHECKOUT_MS = 5 * MS_PER_MINUTE;

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
export class PaymentsService {
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
    const { asOf, entitlements } = await this.store.entitlementSnapshot(studentId, plan.examId);
    if (accessSummary(entitlements, asOf).hasAccess) throw new AlreadyEntitled();

    const open = await this.store.findPendingPayment(studentId, planId);
    if (open) {
      if (isUsable(open, new Date())) return { payment: open, created: false };
      // Expired, or never got its link: close it so a fresh one can be opened.
      await this.store.closePendingPayment(open.id, "CANCELLED");
    }

    const created = await this.store.createPendingPayment({
      studentId,
      planId,
      provider: provider.name,
      amountMinor: plan.priceMinor,
      currency: plan.currency,
      idempotencyKey,
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
    if (plan?.status !== "ACTIVE") throw new PlanNotAvailable();
    if ((await this.catalog.examStatus(plan.examId)) !== "ACTIVE") throw new PlanNotAvailable();
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
