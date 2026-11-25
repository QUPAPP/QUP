/**
 * Public read contract of Billing, for other modules (AGENTS.md §5).
 * Owned here, the provider: assessments → billing, never back.
 *
 * DOMAIN_MODEL.md §3: "entitlement checked server-side" — this is that check.
 */
export interface ExamAccess {
  /** Whether the student has an entitlement in force for the exam right now. */
  hasExamAccess(studentId: string, examId: string): Promise<boolean>;
}

export const EXAM_ACCESS = Symbol("EXAM_ACCESS");

/** What a payment bought and what became of it — enough to write the student a receipt. */
export interface PaymentReceipt {
  studentId: string;
  planName: string;
  amountMinor: number;
  currency: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED" | "REFUNDED" | "CANCELLED";
  paidAt: Date | null;
  /** Until when a full refund may be asked for (refund-policy.ts); null when nothing was paid. */
  refundableUntil: Date | null;
}

export interface PaymentReceipts {
  /** Null when no such payment exists. */
  receiptFor(paymentId: string): Promise<PaymentReceipt | null>;
}

export const PAYMENT_RECEIPTS = Symbol("PAYMENT_RECEIPTS");

/** Purchase facts for the admin funnel (PRD §17: preview → purchase). Counts, never amounts per person. */
export interface PurchaseFacts {
  /** Of these students, how many have a payment that succeeded (and was kept or later refunded) since the time. */
  payingStudentsAmong(studentIds: readonly string[], since: Date): Promise<number>;
}

export const PURCHASE_FACTS = Symbol("PURCHASE_FACTS");

/** What the "your subscription ends soon" email needs, read when it is written. */
export interface EndingSubscriptionNotice {
  studentId: string;
  examName: string;
  endsAt: Date | null;
  /** False once it was renewed, revoked or has already ended: then no email. */
  stillEnding: boolean;
}

export interface SubscriptionNotices {
  /** Queues every reminder due now (reminder-policy.ts); the worker calls it on a schedule. */
  queueEndingReminders(now: Date): Promise<number>;
  endingNoticeFor(entitlementId: string): Promise<EndingSubscriptionNotice | null>;
}

export const SUBSCRIPTION_NOTICES = Symbol("SUBSCRIPTION_NOTICES");
