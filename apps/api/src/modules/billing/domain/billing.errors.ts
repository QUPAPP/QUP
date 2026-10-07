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

/** OPEN_QUESTIONS.md #5a: an offered plan keeps its price and duration. */
export class PlanNotDraft extends DomainError {
  readonly code = "PLAN_NOT_DRAFT";
  readonly kind = "RULE_VIOLATION";

  constructor() {
    super("Only a draft plan can be edited. Create a new plan and retire this one instead.");
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
    super("You already have access to this exam.");
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
