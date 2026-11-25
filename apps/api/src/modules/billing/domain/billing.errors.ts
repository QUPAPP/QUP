import { DomainError } from "../../../common/errors/domain-error.js";

export class PlanNotFound extends DomainError {
  readonly code = "PLAN_NOT_FOUND";
  readonly kind = "NOT_FOUND";

  constructor() {
    super("The plan was not found.");
  }
}

export class PlanCodeTaken extends DomainError {
  readonly code = "PLAN_CODE_TAKEN";
  readonly kind = "CONFLICT";

  constructor() {
    super("A plan with this code already exists.");
  }
}

/** plan-rules.ts: an offered plan keeps its exams; a retired plan keeps everything. */
export class PlanFieldsLocked extends DomainError {
  readonly code = "PLAN_FIELDS_LOCKED";
  readonly kind = "RULE_VIOLATION";

  override readonly details: { fields: readonly string[] };

  constructor(status: string, fields: readonly string[]) {
    super(
      status === "RETIRED"
        ? "A retired plan cannot be edited."
        : `These fields cannot change while the plan is ${status}: ${fields.join(", ")}. Create a new plan instead.`,
    );
    this.details = { fields };
  }
}

export class PlanContentInvalid extends DomainError {
  readonly code = "PLAN_CONTENT_INVALID";
  readonly kind = "RULE_VIOLATION";
  override readonly details: { problems: readonly string[] };

  constructor(problems: readonly string[]) {
    super(`The plan is not valid: ${problems.join(", ")}.`);
    this.details = { problems };
  }
}

export class InvalidPlanTransition extends DomainError {
  readonly code = "INVALID_PLAN_TRANSITION";
  readonly kind = "RULE_VIOLATION";

  constructor(from: string, to: string) {
    super(`A plan cannot move from ${from} to ${to}.`);
  }
}

export class PlanNotSellable extends DomainError {
  readonly code = "PLAN_NOT_SELLABLE";
  readonly kind = "RULE_VIOLATION";

  constructor(reason: string) {
    super(reason);
  }
}

/** A plan that does not exist, is not offered, or belongs to an exam that is not offered. */
export class PlanNotAvailable extends DomainError {
  readonly code = "PLAN_NOT_AVAILABLE";
  readonly kind = "NOT_FOUND";

  constructor() {
    super("The plan is not available.");
  }
}

export class ExamNotFound extends DomainError {
  readonly code = "EXAM_NOT_FOUND";
  readonly kind = "NOT_FOUND";

  constructor() {
    super("The exam was not found.");
  }
}

export class StudentNotFound extends DomainError {
  readonly code = "STUDENT_NOT_FOUND";
  readonly kind = "NOT_FOUND";

  constructor() {
    super("The student was not found.");
  }
}

export class EntitlementNotFound extends DomainError {
  readonly code = "ENTITLEMENT_NOT_FOUND";
  readonly kind = "NOT_FOUND";

  constructor() {
    super("The entitlement was not found.");
  }
}

/** OPEN_QUESTIONS.md #5a: never take money for access the student already has. */
export class AlreadyEntitled extends DomainError {
  readonly code = "ALREADY_ENTITLED";
  readonly kind = "CONFLICT";

  constructor() {
    super("You already have access to everything this plan includes.");
  }
}

/** Also used for another student's payment, so ids cannot be probed (SECURITY.md: IDOR). */
export class PaymentNotFound extends DomainError {
  readonly code = "PAYMENT_NOT_FOUND";
  readonly kind = "NOT_FOUND";

  constructor() {
    super("The payment was not found.");
  }
}

export class PaymentIdempotencyKeyReused extends DomainError {
  readonly code = "IDEMPOTENCY_KEY_REUSED";
  readonly kind = "RULE_VIOLATION";

  constructor() {
    super("This Idempotency-Key was already used for a different request.");
  }
}

/** A newer checkout for the same purchase replaced this one while it was being created. */
export class CheckoutSuperseded extends DomainError {
  readonly code = "CHECKOUT_SUPERSEDED";
  readonly kind = "CONFLICT";

  constructor() {
    super("Another checkout for this plan was started. Use that one, or try again.");
  }
}

export class PaymentsNotConfigured extends DomainError {
  readonly code = "PAYMENTS_NOT_CONFIGURED";
  readonly kind = "UNAVAILABLE";

  constructor() {
    super("Online payment is not available yet.");
  }
}

export class PaymentProviderUnavailable extends DomainError {
  readonly code = "PAYMENT_PROVIDER_UNAVAILABLE";
  readonly kind = "UNAVAILABLE";

  constructor() {
    super("The payment service could not be reached. You have not been charged; please try again.");
  }
}

export class WebhookProviderUnknown extends DomainError {
  readonly code = "WEBHOOK_PROVIDER_UNKNOWN";
  readonly kind = "NOT_FOUND";

  constructor() {
    super("Unknown payment provider.");
  }
}

/** Deliberately says nothing about why: the caller is unauthenticated. */
export class WebhookSignatureInvalid extends DomainError {
  readonly code = "WEBHOOK_SIGNATURE_INVALID";
  readonly kind = "UNAUTHENTICATED";

  constructor() {
    super("The webhook signature is not valid.");
  }
}

export class WebhookPayloadInvalid extends DomainError {
  readonly code = "WEBHOOK_PAYLOAD_INVALID";
  readonly kind = "INVALID_INPUT";

  constructor() {
    super("The webhook payload could not be understood.");
  }
}

/** The provider's payment already settled another of our payments: the same money cannot buy twice. */
export class ProviderPaymentAlreadyUsed extends DomainError {
  readonly code = "PROVIDER_PAYMENT_ALREADY_USED";
  readonly kind = "CONFLICT";

  constructor() {
    super("This provider payment is already linked to another payment.");
  }
}

/** Reconciling by hand: what the provider says was paid is not what this payment asked for. */
export class ProviderPaymentDoesNotMatch extends DomainError {
  readonly code = "PROVIDER_PAYMENT_DOES_NOT_MATCH";
  readonly kind = "RULE_VIOLATION";
  override readonly details: { expectedMinor: number; paidMinor: number; currency: string };

  constructor(details: { expectedMinor: number; paidMinor: number; currency: string }) {
    super("The provider payment's amount or currency differs from this payment.");
    this.details = details;
  }
}

/** The provider has no paid (or refunded) payment under that id yet. */
export class ProviderPaymentNotPaid extends DomainError {
  readonly code = "PROVIDER_PAYMENT_NOT_PAID";
  readonly kind = "RULE_VIOLATION";

  constructor() {
    super("The provider does not report this payment as paid.");
  }
}
