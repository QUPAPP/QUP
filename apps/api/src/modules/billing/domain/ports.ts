import type { ActorContext } from "../../../common/actor.js";
import type { EntitlementWindow } from "./entitlement-period.js";
import type { PlanStatus } from "./plan-lifecycle.js";

export interface Plan {
  id: string;
  examId: string;
  code: string;
  name: string;
  priceMinor: number;
  currency: string;
  /** Null: access does not end. */
  durationDays: number | null;
  status: PlanStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type PaymentStatus = "PENDING" | "SUCCEEDED" | "FAILED" | "REFUNDED" | "CANCELLED";

export interface Payment {
  id: string;
  studentId: string;
  planId: string;
  provider: string;
  /** The provider's id for the checkout this payment is collected through. */
  providerReference: string | null;
  amountMinor: number;
  currency: string;
  status: PaymentStatus;
  idempotencyKey: string;
  checkoutUrl: string | null;
  checkoutExpiresAt: Date | null;
  createdAt: Date;
  paidAt: Date | null;
}

export type EntitlementSource = "PAYMENT" | "ADMIN" | "PROMO";

export interface Entitlement extends EntitlementWindow {
  id: string;
  studentId: string;
  examId: string;
  planId: string | null;
  source: EntitlementSource;
  createdAt: Date;
}

export type NewPaymentResult =
  | { kind: "CREATED"; payment: Payment }
  /** The Idempotency-Key already belongs to this payment. */
  | { kind: "KEY_EXISTS"; payment: Payment }
  /** Another request opened a checkout for the same student and plan first. */
  | { kind: "PENDING_EXISTS" };

/** What settling did. Everything but SETTLED means nothing changed. */
export type SettleResult = "SETTLED" | "ALREADY_SETTLED" | "REFUNDED_EARLIER";
export type RefundResult = "REFUNDED" | "ALREADY_REFUNDED" | "NEVER_PAID";

export interface BillingStore {
  /* Plans */
  findPlan(planId: string): Promise<Plan | null>;
  listPlans(filter: { examId?: string; status?: PlanStatus }): Promise<Plan[]>;
  /** Throws PlanCodeTaken on a duplicate code. */
  createPlan(input: {
    examId: string;
    code: string;
    name: string;
    priceMinor: number;
    currency: string;
    durationDays: number | null;
  }): Promise<Plan>;
  /** Applies only while the plan is DRAFT; null when it is not (or does not exist). */
  updateDraftPlan(
    planId: string,
    changes: { name?: string; priceMinor?: number; durationDays?: number | null },
  ): Promise<Plan | null>;
  /** Moves the plan from `from` to `to` and audits it; null when it was no longer in `from`. */
  transitionPlan(
    planId: string,
    from: PlanStatus,
    to: PlanStatus,
    actor: ActorContext,
  ): Promise<Plan | null>;

  /* Entitlements */
  studentExists(studentId: string): Promise<boolean>;
  entitlementsFor(studentId: string, examId?: string): Promise<Entitlement[]>;
  /**
   * A student's entitlements for an exam together with the database's clock.
   * Whether an entitlement is in force must be judged against the same clock
   * that stamped its start: the application's own clock can differ by seconds,
   * which is long enough to tell a student who just paid that they have no access.
   */
  entitlementSnapshot(
    studentId: string,
    examId: string,
  ): Promise<{ asOf: Date; entitlements: Entitlement[] }>;
  /** Admin grant, audited. The period follows `nextEntitlementPeriod`. */
  grantByAdmin(
    input: { studentId: string; examId: string; durationDays: number | null },
    actor: ActorContext,
  ): Promise<Entitlement>;
  /** ACTIVE → REVOKED, audited; null when it does not exist. Idempotent. */
  revokeEntitlement(entitlementId: string, actor: ActorContext): Promise<Entitlement | null>;

  /* Payments */
  findPayment(paymentId: string): Promise<Payment | null>;
  findPaymentByIdempotencyKey(key: string): Promise<Payment | null>;
  findPaymentByProviderReference(provider: string, reference: string): Promise<Payment | null>;
  findPendingPayment(studentId: string, planId: string): Promise<Payment | null>;
  createPendingPayment(input: {
    studentId: string;
    planId: string;
    provider: string;
    amountMinor: number;
    currency: string;
    idempotencyKey: string;
  }): Promise<NewPaymentResult>;
  /** Records the provider checkout on a still-PENDING payment; false when it no longer is. */
  attachCheckout(
    paymentId: string,
    checkout: { reference: string; checkoutUrl: string; expiresAt: Date },
  ): Promise<boolean>;
  /** PENDING → FAILED or CANCELLED. No-op in any other status. */
  closePendingPayment(paymentId: string, status: "FAILED" | "CANCELLED"): Promise<void>;
  /**
   * The provider confirmed the money arrived. One transaction (SECURITY.md:
   * "entitlement grant atomic with successful payment state"): lock the
   * payment, mark it SUCCEEDED, grant the entitlement, write the audit entry.
   * Replays change nothing (DOMAIN_MODEL.md §3).
   */
  settlePayment(
    paymentId: string,
    confirmation: { providerPaymentId: string; paidAt: Date },
    actor: ActorContext,
  ): Promise<SettleResult>;
  /** Full refund: SUCCEEDED → REFUNDED and its entitlement → REVOKED, in one transaction. */
  refundPayment(
    paymentId: string,
    confirmation: { providerPaymentId: string },
    actor: ActorContext,
  ): Promise<RefundResult>;
}

export const BILLING_STORE = Symbol("BILLING_STORE");

/* -------------------------------------------------------------------------- */
/* Payment provider (PRD §15: "payment provider behind adapter")               */
/* -------------------------------------------------------------------------- */

export interface CheckoutRequest {
  /** Our payment id; the provider echoes it back on its events. */
  paymentId: string;
  /** Shown to the payer. */
  title: string;
  amountMinor: number;
  currency: string;
  expiresAt: Date;
}

export interface CheckoutSession {
  /** The provider's id for the checkout. */
  reference: string;
  checkoutUrl: string;
  /** What the provider will actually charge — checked against our own amount. */
  amountMinor: number;
  currency: string;
}

/** An authenticated notification that something happened to a payment. */
export interface ProviderEvent {
  type: string;
  providerPaymentId: string;
  /** The checkout the payment was made through, when the provider says. */
  checkoutReference: string | null;
  /** Our payment id as echoed by the provider, when present. */
  paymentId: string | null;
}

export type ProviderPaymentStatus = "PAID" | "REFUNDED" | "PARTIALLY_REFUNDED" | "OTHER";

export interface ProviderPayment {
  id: string;
  status: ProviderPaymentStatus;
  amountMinor: number;
  currency: string;
  paidAt: Date | null;
}

export interface PaymentProvider {
  /** Stable lower-case name: stored on payments and used in the webhook path. */
  readonly name: string;
  /** Throws ProviderRequestFailed. */
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
  /**
   * Authenticates a webhook delivery from its exact bytes. Returns null for
   * an authentic event that is not about a payment. Throws
   * WebhookSignatureInvalid / WebhookPayloadInvalid.
   */
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | undefined>): ProviderEvent | null;
  /** The provider's current view of a payment — the authority on status and amount. */
  fetchPayment(providerPaymentId: string): Promise<ProviderPayment>;
}

/** Null when no provider is configured: selling is off, everything else works. */
export const PAYMENT_PROVIDER = Symbol("PAYMENT_PROVIDER");

/** A provider call that failed. Safe to log; never carries credentials. */
export class ProviderRequestFailed extends Error {
  constructor(
    readonly operation: string,
    /** HTTP status, or null when the provider was not reached or answered nonsense. */
    readonly status: number | null,
    readonly providerCode: string | null,
  ) {
    super(`Payment provider ${operation} failed (${status ?? "no response"}).`);
    this.name = "ProviderRequestFailed";
  }
}
