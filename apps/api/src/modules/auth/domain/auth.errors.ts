import { DomainError } from "../../../common/errors/domain-error.js";

/**
 * Deliberately identical for "no such account" and "wrong password", so the
 * login endpoint cannot be used to discover which emails/phones are registered.
 */
export class InvalidCredentials extends DomainError {
  readonly code = "INVALID_CREDENTIALS";
  readonly kind = "UNAUTHENTICATED";

  constructor() {
    super("The email/phone or password is incorrect.");
  }
}

export class NotAuthenticated extends DomainError {
  readonly code = "UNAUTHENTICATED";
  readonly kind = "UNAUTHENTICATED";

  constructor() {
    super("Authentication is required.");
  }
}

/** Only reported after the correct password, so it reveals nothing to a guesser. */
export class AccountDisabled extends DomainError {
  readonly code = "ACCOUNT_DISABLED";
  readonly kind = "FORBIDDEN";

  constructor() {
    super("This account is disabled.");
  }
}

export class IdentifierTaken extends DomainError {
  readonly code = "IDENTIFIER_TAKEN";
  readonly kind = "CONFLICT";

  constructor(readonly identifier: "email" | "phone") {
    super(`An account with this ${identifier} already exists.`);
  }
}

export class PermissionDenied extends DomainError {
  readonly code = "FORBIDDEN";
  readonly kind = "FORBIDDEN";

  constructor() {
    super("You do not have permission to perform this action.");
  }
}

export class CurrentPasswordIncorrect extends DomainError {
  readonly code = "CURRENT_PASSWORD_INCORRECT";
  readonly kind = "RULE_VIOLATION";

  constructor() {
    super("The current password is incorrect.");
  }
}

/** One-time codes (otp-policy.ts). */
export class EmailRequired extends DomainError {
  readonly code = "EMAIL_REQUIRED";
  readonly kind = "RULE_VIOLATION";

  constructor() {
    super("This account has no email address to send a code to.");
  }
}

export class EmailAlreadyVerified extends DomainError {
  readonly code = "EMAIL_ALREADY_VERIFIED";
  readonly kind = "CONFLICT";

  constructor() {
    super("This email address is already verified.");
  }
}

/** Also what a code for another account, or for an account that does not exist, looks like. */
export class InvalidOrExpiredCode extends DomainError {
  readonly code = "INVALID_OR_EXPIRED_CODE";
  readonly kind = "INVALID_INPUT";

  constructor() {
    super("The code is wrong or has expired. Request a new one.");
  }
}

export class CodeRequestedTooOften extends DomainError {
  readonly code = "CODE_REQUESTED_TOO_OFTEN";
  readonly kind = "RATE_LIMITED";
  override readonly details: { retryAfterSeconds: number };

  constructor(retryAfterSeconds: number) {
    super("A code was sent recently. Wait a moment before asking for another.");
    this.details = { retryAfterSeconds };
  }
}

/**
 * Staff accounts are not erased from the account screen: an admin takes their
 * roles away first, so the platform never loses its last admin by accident.
 */
export class StaffAccountCannotBeErased extends DomainError {
  readonly code = "STAFF_ACCOUNT_CANNOT_BE_ERASED";
  readonly kind = "RULE_VIOLATION";

  constructor() {
    super("This account has staff roles. An admin must remove them before it can be deleted.");
  }
}

/** The human check was missing, expired, already used or refused. The form shows a fresh one. */
export class CaptchaFailed extends DomainError {
  readonly code = "CAPTCHA_FAILED";
  readonly kind = "INVALID_INPUT";

  constructor() {
    super("Confirm you are not a robot, then try again.");
  }
}

/** The human check's provider could not be asked; try again in a moment. */
export class CaptchaUnavailable extends DomainError {
  readonly code = "CAPTCHA_UNAVAILABLE";
  readonly kind = "UNAVAILABLE";

  constructor() {
    super("The human check is unavailable right now. Try again shortly.");
  }
}
